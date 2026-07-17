import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, CourseType, DeptResultStatus, Level } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PipelineResolverService } from './pipeline-resolver.service';
import { RespondToApprovalRequestDto } from './approval.dto';
import type {
  IApprovalPipelineStatus,
  IApprovalStepStatus,
  IBuildPipelineResult,
  ICourseSessionContext,
  IPipelineStep,
} from './approval.types';
import { MessageQueueService } from 'src/message-queue/message-queue.service';
import { EmailSubject } from 'src/message-queue/message-queue.dto';

@Injectable()
export class ApprovalManager {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PipelineResolverService,
    private readonly logger: Logger,
    private readonly messageQueueService: MessageQueueService,
  ) {}


  async buildApprovalPipeline(
    courseSesnDeptLevelId: string, 
    lecturerId: string
  ): Promise<IBuildPipelineResult> {
    // 1. Get the junction context
    const junction = await this.prisma.courseSesnDeptAndLevel.findUnique({
      where: { id: courseSesnDeptLevelId },
      include: {
        courseSession: {
          include: { 
            course: { include: { department: true } } 
          }
        },
        department: true,
      }
    });

    if (!junction) throw new NotFoundException('Course Session Department/Level record not found');

    const offeringDeptId = junction.courseSession.course.departmentId;
    const takingDeptId = junction.departmentId;
    const courseType = offeringDeptId === takingDeptId ? CourseType.INTRA : CourseType.INTER;

    // 2. Resolve Template/Steps
    const template = await this.resolver.resolveActiveTemplate(
      junction.courseSession.course.department.facultyId,
    );

    const stepDefinitions = template
      ? template.steps
      : this.resolver.getDefaultSteps(courseType as any);

    // 3. Create the Flow
    return this.prisma.$transaction(async (tx) => {
      const flow = await tx.approvalFlow.upsert({
        where: { courseSesnDeptLevelId },
        update: { approvalStatus: ApprovalStatus.REQUESTED },
        create: {
          courseSesnDeptLevel: { connect: { id: courseSesnDeptLevelId } },
          lecturer: { connect: { id: lecturerId } },
          approvalStatus: ApprovalStatus.REQUESTED,
          courseType
        },
      });

      // 4. Resolve and create Requests
      const resolvedSteps = await this.resolver.resolveStepsForFlow(
        stepDefinitions,
        offeringDeptId,
        takingDeptId,
        junction.level,
      );

      const requests = await tx.approvalRequest.createMany({
        data: resolvedSteps.map(step => ({
          approvalFlowId: flow.id,
          lecturerDesignationId: step.lecturerDesignationId,
          priority: step.priority,
          status: ApprovalStatus.REQUESTED,
        })),
        skipDuplicates: true,
      });

      // Find the first step from your 'resolvedSteps' array
    const firstStep = resolvedSteps.find(s => s.priority === 1);

    if (firstStep) {
      // We need to fetch the email because 'resolvedSteps' only has IDs
      const recipient = await this.prisma.lecturerDesignation.findUnique({
        where: { id: firstStep.lecturerDesignationId },
        include: { 
          lecturer: { 
            include: { user: { select: { email: true,  } } }
          } 
        }
      });

        if (recipient?.lecturer?.user?.email) {
          await this.messageQueueService.enqueueNotificationEmail({
            subject: EmailSubject.APPROVAL_REQUEST,
            email: recipient.lecturer.user.email,
            title: 'New Result Approval Request',
            message: `A new result submission requires your review. Please log in to the portal to approve or provide feedback.`,
          });
        }
      }
      // Update junction status to IN_PROGRESS
      await tx.courseSesnDeptAndLevel.update({
        where: { id: courseSesnDeptLevelId },
        data: { resultStatus: DeptResultStatus.IN_PROGRESS }
      });
      

      return {
        courseSesnDeptLevelId,
        flowId: flow.id,
        stepsCreated: resolvedSteps.length,
      } as any;
    }, 
    {
      maxWait: 5000, // default is 2000
      timeout: 30000, // 30 seconds
  });
  }
async respondToApprovalRequest(
    lecturerId: string,
    approvalRequestId: string,
    response: RespondToApprovalRequestDto,
  ) {
    // 1. Fetch Request with all necessary Email & Metadata paths (including resultUploads)
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: {
        lecturerDesignation: true,
        approvalFlow: {
          include: {
            lecturer: { include: { user: { select: { email: true } } } },
            courseSesnDeptLevel: { 
              include: { 
                department: { select: { name: true } },
                courseSession: { include: { course: { select: { code: true } } } },
                resultUploads: { // <--- Added here to easily locate the uploaded file id
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                  select: { id: true }
                }
              } 
            },
            approvalRequests: {
              orderBy: { priority: 'asc' },
              include: {
                lecturerDesignation: {
                  include: { lecturer: { include: { user: { select: { email: true } } } } }
                }
              }
            },
          },
        },
      },
    });

    if (!request) throw new NotFoundException('Approval request not found');

    await this.resolver.assertLecturerOwnsDesignation(request.lecturerDesignationId, lecturerId);

    const blockingRequest = request.approvalFlow.approvalRequests.find(
      (req) => req.priority < request.priority && req.status !== ApprovalStatus.APPROVED,
    );
    if (blockingRequest) {
      throw new BadRequestException(`Step ${blockingRequest.priority} must be approved first`);
    }

    const isLastStep = !request.approvalFlow.approvalRequests.some(
      (req) => req.priority > request.priority && req.status === ApprovalStatus.REQUESTED,
    );
    const isRejection = response.approvalStatus === ApprovalStatus.REJECTED;
    
    const courseSesnDeptLevelId = request.approvalFlow.courseSesnDeptLevelId;
    const activeUpload = request.approvalFlow.courseSesnDeptLevel.resultUploads[0]; 
    
    if (isLastStep && !isRejection && !activeUpload) {
      throw new NotFoundException('No uploaded result file found associated with this department level approval flow.');
    }

    const courseCode = request.approvalFlow.courseSesnDeptLevel.courseSession.course.code;
    const deptName = request.approvalFlow.courseSesnDeptLevel.department.name;

    await this.prisma.$transaction(async (tx) => {
      // A. Update the specific Request
      await tx.approvalRequest.update({
        where: { id: approvalRequestId },
        data: {
          status: response.approvalStatus,
          feedback: response.feedback ?? null,
          respondedAt: new Date(),
        },
      });

      // B. Handle Rejection logic
      if (isRejection) {
        await tx.approvalFlow.update({
          where: { id: request.approvalFlowId },
          data: { approvalStatus: ApprovalStatus.REJECTED },
        });

        await tx.courseSesnDeptAndLevel.update({
          where: { id: courseSesnDeptLevelId },
          data: { resultStatus: DeptResultStatus.REJECTED },
        });

        await this.resetApprovalFlow(request.approvalFlowId);
      } 
      
      // C. Handle Final Approval logic (Publish & Process)
      else if (isLastStep) {
        await tx.approvalFlow.update({
          where: { id: request.approvalFlowId },
          data: { approvalStatus: ApprovalStatus.APPROVED },
        });

        await tx.courseSesnDeptAndLevel.update({
          where: { id: courseSesnDeptLevelId },
          data: { resultStatus: DeptResultStatus.APPROVED },
        });
        
        // Trigger Result Processing safely using the resolved database keys        
        await this.messageQueueService.enqueueProcessResults({
          resultUploadId: activeUpload.id, // Resolved dynamically
          courseSesnDeptLevelId: courseSesnDeptLevelId // Resolved dynamically
        });
      }
    });

    // 5. Notification System (Post-Transaction)
    try {
      const uploader = request.approvalFlow.lecturer;

      if (isRejection) {
        await this.messageQueueService.enqueueNotificationEmail({
          subject: EmailSubject.APPROVAL_REQUEST,
          email: uploader.user.email,
          title: 'Submission Feedback Required',
          message: `Hello ${uploader.firstName}, your result submission for ${courseCode} (${deptName}) was rejected. \n\nReason: ${response.feedback}`,
        });
      } 
      else if (isLastStep) {
        await this.messageQueueService.enqueueNotificationEmail({
          subject: EmailSubject.APPROVAL_SUCCESS,
          email: uploader.user.email,
          title: 'Approval Process Complete',
          message: `Hello ${uploader.firstName}, your results for ${courseCode} have been fully approved by all officers.`,
        });
      } 
      else {
        const nextRequest = request.approvalFlow.approvalRequests.find(
          (r) => r.priority === request.priority + 1
        );
        const nextEmail = (nextRequest as any)?.lecturerDesignation?.lecturer?.user?.email;

        if (nextEmail) {
          await this.messageQueueService.enqueueNotificationEmail({
            subject: EmailSubject.APPROVAL_REQUEST,
            email: nextEmail,
            title: 'New Action Required',
            message: `The results for ${courseCode} have been approved by the previous officer and are now awaiting your review.`,
          });
        }
      }
    } catch (notificationError) {
      console.error('Notification failed to enqueue:', notificationError);
    }

    return { 
      success: true, 
      message: isRejection ? 'Result rejected' : isLastStep ? 'Final approval complete' : 'Step approved' 
    };
  }
  
  async checkApprovalPipelineStatus(
    approvalFlowId: string,
  ): Promise<IApprovalPipelineStatus> {
    const flow = await this.prisma.approvalFlow.findUnique({
      where: { id: approvalFlowId },
      include: {
        approvalRequests: {
          orderBy: { priority: 'asc' },
          include: {
            lecturerDesignation: {
              include: { lecturer: true },
            },
          },
        },
        courseSesnDeptLevel : true,
      },
    });

    if (!flow) {
      throw new NotFoundException(`Approval flow ${approvalFlowId} not found`);
    }

    const requests = flow.approvalRequests;

    if (!requests.length) {
      throw new BadRequestException(`Flow ${approvalFlowId} has no steps`);
    }

    const maxPriorityLevel = requests[requests.length - 1].priority;
    const currentStep = requests.find((r) => r.status !== ApprovalStatus.APPROVED);
    const rejectedStep = requests.find((r) => r.status === ApprovalStatus.REJECTED);

    const steps: IApprovalStepStatus[] = requests.map((req) => ({
      priority:    req.priority,
      role:        req.lecturerDesignation.role,
      lecturerName: `${req.lecturerDesignation.lecturer.firstName} ${req.lecturerDesignation.lecturer.lastName}`,
      status:      req.status,
      respondedAt: req.respondedAt ?? undefined,
      feedback:    req.feedback ?? undefined,
    }));

    return {
      flowId:              approvalFlowId,
      courseSessionId:     flow.courseSesnDeptLevelId,
      takingDepartmentId:  flow.courseSesnDeptLevel.id,
      overallStatus:       flow.approvalStatus,
      currentPriorityLevel: currentStep?.priority ?? maxPriorityLevel,
      maxPriorityLevel,
      steps,
      rejectionFeedback:   rejectedStep?.feedback ?? undefined,
    };
  }

async checkAllFlowsForCourseSession(courseSessionId: string) {
    // 1. Fetch the junction records for this course session
    // Each junction record potentially has ONE unique approval flow
    const junctions = await this.prisma.courseSesnDeptAndLevel.findMany({
      where: { courseSessionId },
      include: {
        department: { select: { name: true } },
        // Reach into the 1-to-1 relation we added to schema.prisma
        approvalFlow: {
          include: {
            approvalRequests: {
              select: { status: true, priority: true },
              orderBy: { priority: 'asc' },
            },
          },
        },
      },
      orderBy: { departmentId: 'asc' },
    });

    // 2. Map the junctions (the source of truth for "who is taking the course")
    return junctions.map((junction) => {
      const flow = junction.approvalFlow;
      
      return {
        junctionId: junction.id,
        takingDepartmentId: junction.departmentId,
        takingDepartmentName: junction.department.name,
        level: junction.level,
        resultStatus: junction.resultStatus, // Current badge status (APPROVED, REJECTED, etc.)
        
        // Flow specific details (if the flow has been built/triggered)
        flowId: flow?.id ?? null,
        overallStatus: flow?.approvalStatus ?? 'NOT_UPLOADED',
        totalSteps: flow?.approvalRequests.length ?? 0,
        approvedSteps: flow?.approvalRequests.filter(
          (r) => r.status === ApprovalStatus.APPROVED,
        ).length ?? 0,
      };
    });
  }

  async getApprovalAuditTrail(approvalFlowId: string) {
    const snapshots = await this.prisma.approvalSnapshot.findMany({
      where: { approvalRequest: { approvalFlowId } },
      include: { approvalRequest: { select: { priority: true } } },
      orderBy: { timestamp: 'asc' },
    });

    return snapshots.map((snap) => ({
      priority:       snap.approvalRequest.priority,
      lecturerName:   snap.lecturerName,
      roleHeld:       snap.roleHeld,
      departmentName: snap.departmentName,
      action:         snap.action,
      feedback:       snap.feedback,
      timestamp:      snap.timestamp,
    }));
  }

async resetApprovalFlow(approvalFlowId: string): Promise<void> {
    await this.prisma.approvalRequest.updateMany({
      where: { approvalFlowId },
      data: {
        status: ApprovalStatus.REQUESTED,
        feedback: null,
        respondedAt: null,
      },
    });
    await this.prisma.approvalFlow.update({
      where: { id: approvalFlowId },
      data: { approvalStatus: ApprovalStatus.REQUESTED },
    });
  }
/**
 * Get the next pending ApprovalRequest in a flow (lowest priority with REQUESTED status).
 * Returns null if no pending requests remain.
 */
async getNextPendingRequest(approvalFlowId: string) {
  return this.prisma.approvalRequest.findFirst({
    where: {
      approvalFlowId,
      status: ApprovalStatus.REQUESTED,
    },
    orderBy: { priority: 'asc' },
    include: {
      lecturerDesignation: {
        include: { lecturer: true },
      },
    },
  });
}

async pendingDepartmentApproval(departmentId: string) {
  const requests = await this.prisma.approvalRequest.findMany({
    where: {
      status: ApprovalStatus.REQUESTED,
      lecturerDesignation: {
        lecturer: { departmentId },
      },
    },
    include: {
      approvalFlow: {
        include: {
          courseSesnDeptLevel: {
            include: {
              department: { select: { name: true } }, // To get takingDept name
              courseSession: {
                include: {
                  course: {
                    include: { department: { select: { name: true } } }, // To get offeringDept name
                  },
                  resultUploads: {
                    include: {
                      uploadedBy: { select: { firstName: true, lastName: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
      lecturerDesignation: {
        include: {
          lecturer: {
            include: { department: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return this.mapPendingRequests(requests, true);
}


async pendingFacultyApproval(facultyId: string) {
  
    const requests = await this.prisma.approvalRequest.findMany({
      where: {
        status: ApprovalStatus.REQUESTED,
        lecturerDesignation: {
          lecturer: {
            department: { facultyId },
          },
        },
      },
    include: {
      approvalFlow: {
        include: {
          courseSesnDeptLevel: {
            include: {
              department: { select: { name: true } }, // To get takingDept name
              courseSession: {
                include: {
                  course: {
                    include: { department: { select: { name: true } } }, // To get offeringDept name
                  },
                  resultUploads: {
                    include: {
                      uploadedBy: { select: { firstName: true, lastName: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      },
      lecturerDesignation: {
        include: {
          lecturer: {
            include: { department: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return this.mapPendingRequests(requests, true);
}


private mapPendingRequests(requests: any[], includeDept = false) {
  return requests.map((req) => {
    const flow = req.approvalFlow;
    const junction = flow.courseSesnDeptLevel;
    const session = junction.courseSession;
    const course = session.course;
    const latestUpload = session.resultUploads[0];

    return {
      requestId:    req.id,
      priority:     req.priority,
      role:         req.lecturerDesignation.role,
      part:         req.lecturerDesignation.part,
      
      ...(includeDept && {
        assignedTo: `${req.lecturerDesignation.lecturer.firstName} ${req.lecturerDesignation.lecturer.lastName}`,
        department:  req.lecturerDesignation.lecturer.department.name,
      }),

      // Taking Dept is now on the Junction
      takingDept:   junction.department.name,
      
      ...(includeDept && {
        // Offering Dept is now on the Course (accessed via Session)
        offeringDept: course.department.name,
      }),

      // Level is now on the Junction
      level:        junction.level,
      courseCode:   course.code,
      courseTitle:  course.title,
      
      uploadedBy: latestUpload
        ? `${latestUpload.uploadedBy.firstName} ${latestUpload.uploadedBy.lastName}`
        : null,
      
      resultFile: latestUpload?.file ?? null,
      flowStatus: flow.approvalStatus,
      createdAt:  req.createdAt,
    };
  });
}


}