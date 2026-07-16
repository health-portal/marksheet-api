import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GradingFactory } from './grading-factory';
import { Level, AcademicStatus } from '@prisma/client';

@Injectable()
export class GradingService {
  constructor(
    private prisma: PrismaService,
    private factory: GradingFactory,
  ) {}

  async evaluateStudentSession(studentId: string, sessionId: string, level: Level) {
    // 1. Fetch student's current department and faculty strategy
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        department: {
          include: { faculty: true },
        },
      },
    });

    if (!student) throw new Error('Student profile not found');

    const strategyType = student.department.faculty.strategy;
    const strategy = this.factory.getStrategy(strategyType);

    // 2. Fetch all registered course sessions and scores for this student in the session
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, courseSession: { sessionId } },
      include: {
        courseSession: { include: { course: true } },
        results: true,
      },
    });

    const coursesInput = enrollments.map((e) => {
      // If a RESIT result exists, it supersedes the INITIAL result
      const activeResult = e.results.find((r) => r.type === 'RESIT') || e.results.find((r) => r.type === 'INITIAL');
      const gradings = (activeResult?.evaluations as Record<string, any>) || {};

      return {
        courseSessionId: e.courseSessionId,
        courseCode: e.courseSession.course.code,
        scores: (activeResult?.scores as Record<string, number>) || {},
        isFullyGraded: gradings['isFullyGraded'] === true, 
      };
    });

    // 3. Query history to see if they are currently on a REPEAT year
    const previousFailureSession = await this.prisma.studentSessionSummary.findFirst({
      where: {
        studentId,
        status: AcademicStatus.REPEAT,
      },
    });

    // 4. Delegate to strategy
    const grading = strategy.evaluate({
      studentId,
      sessionId,
      level,
      courses: coursesInput,
      hasPreviousRepeat: !!previousFailureSession,
    });

    // 5. Update session summaries strictly based on completeness
    if (grading.isFinalized && grading.suggestedStatus) {
      await this.prisma.studentSessionSummary.upsert({
        where: { studentId_sessionId: { studentId, sessionId } },
        update: {
          level,
          gpa: grading.calculatedAverage,
          failedCount: grading.failedCoursesCount,
          status: grading.suggestedStatus,
        },
        create: {
          studentId,
          sessionId,
          level,
          gpa: grading.calculatedAverage,
          failedCount: grading.failedCoursesCount,
          status: grading.suggestedStatus,
        },
      });
    } else {
      // If the strategy is not finalized (missing fields or pending resits),
      // we make sure NO summary exists in the DB so they are not promoted yet
      await this.prisma.studentSessionSummary.deleteMany({
        where: { studentId, sessionId },
      });
    }

    return grading;
  }
}