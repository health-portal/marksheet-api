import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { LecturerService } from './lecturer.service';
import { User } from 'src/auth/user.decorator';
import { AuthRoles, UserRoleGuard } from 'src/auth/role.guard';
import { ResultType, UserRole } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { LecturerData, type UserPayload } from 'src/auth/auth.dto';
import { EditResultBody, RegisterStudentBody, UploadResultDto } from './lecturers.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  EnrollmentRes,
  EnrollmentWithResultRes,
  LecturerCourseSessionRes,
  LecturerProfileRes,
} from './lecturers.responses';
import { ApprovalsService } from 'src/approvals/approvals.service';
import { RespondToApprovalRequestDto } from 'src/approvals/approval.dto';
import { ApprovalManager } from 'src/approvals/approval.manager';

@ApiTags('lecturer', 'Lecturer')
@ApiBearerAuth('accessToken')
@Controller('lecturer')
@AuthRoles([UserRole.LECTURER])
@UseGuards(JwtAuthGuard, UserRoleGuard)
export class LecturerController {
  constructor(private readonly lecturerService: LecturerService,
    private readonly approvalManager: ApprovalManager,
  ) {}

  private getLecturerId(user: UserPayload) {
    const lecturerData = user.userData as LecturerData;
    return lecturerData.lecturerId;
  }

  @ApiOperation({ summary: 'List courses' })
  @ApiOkResponse({ type: [LecturerCourseSessionRes] })
  @Get('courses-sessions')
  async listCourseSessions(@User() user: UserPayload) {
    const lecturerId = this.getLecturerId(user);
    return this.lecturerService.getLecturerCourseSessions(lecturerId);
  }

  @ApiOperation({ summary: 'Register a student in a course session' })
  @ApiBody({ type: RegisterStudentBody })
  @ApiOkResponse({ description: 'Student registered successfully' })
  @ApiForbiddenResponse({
    description:
      'You are not authorized to register students in this course session.',
  })
  @ApiConflictResponse({ description: 'Student already registered' })
  @ApiNotFoundResponse({ description: 'Student not found' })
  @Post('courses-sessions/:courseSessionId/students')
  @HttpCode(HttpStatus.OK)
  async registerStudent(
    @User() user: UserPayload,
    @Param('courseSessionId', ParseUUIDPipe) courseSessionId: string,
    @Body() body: RegisterStudentBody,
  ) {
    const lecturerId = this.getLecturerId(user);
    return await this.lecturerService.registerStudent(
      lecturerId,
      courseSessionId,
      body,
    );
  }

  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Students registered successfully' })
  @ApiOperation({ summary: 'Upload a file for student registrations' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('courses-sessions/:courseSessionId/students/batch')
  async uploadFileForStudentRegistrations(
    @User() user: UserPayload,
    @Param('courseSessionId', ParseUUIDPipe) courseSessionId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType:
            /^(text\/csv|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/i,
          fallbackToMimetype: true,
        })
        .addMaxSizeValidator({
          maxSize: 1024 * 1024,
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
  ) {
    const lecturerId = this.getLecturerId(user);
    // const userSub = "f68d8bdb-8201-4e34-89b6-4bdf448c6242";
    // const lecturerId = "a49a1cee-6042-4c2d-b048-0520133292c3"
    return await this.lecturerService.uploadFileForStudentRegistrations(
      user.sub,
      lecturerId,
      courseSessionId,
      file,
    );
  }

  @ApiOperation({ summary: "Edit a student's score in a course session" })
  @ApiBody({ type: EditResultBody })
  @ApiOkResponse({ description: 'Result edited successfully' })
  @ApiNotFoundResponse({ description: 'Course session or student not found' })
  @Patch('courses-sessions/:courseSessionId/results/:studentId')
  async editResult(
    @User() user: UserPayload,
    @Param('courseSessionId', ParseUUIDPipe) courseSessionId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: EditResultBody,
  ) {
    const lecturerId = this.getLecturerId(user);
    return await this.lecturerService.editResult(
      lecturerId,
      courseSessionId,
      studentId,
      body,
    );
  }

  @ApiOperation({ summary: 'List students in a course session' })
  @ApiOkResponse({ type: [EnrollmentRes] })
  @ApiNotFoundResponse({ description: 'Course session not found' })
  @Get('courses-sessions/:courseSessionId/students')
  async listCourseStudents(
    @User() user: UserPayload,
    @Param('courseSessionId', ParseUUIDPipe) courseSessionId: string,
  ) {
    const lecturerId = this.getLecturerId(user);
    return await this.lecturerService.listCourseStudents(
      lecturerId,
      courseSessionId,
    );
  }

  @ApiOperation({ summary: 'Get lecturer profile' })
  @ApiOkResponse({ type: LecturerProfileRes })
  @ApiNotFoundResponse({ description: 'Lecturer not found' })
  @Get('profile')
  async getProfile(@User() user: UserPayload) {
    const lecturerId = this.getLecturerId(user);
    return await this.lecturerService.getProfile(lecturerId);
  }

  @Post('dept-level/:courseSesnDeptLevelId/results')
  @ApiOperation({
    summary: 'Upload department result',
    description:
      'Lecturer uploads a result file for a specific dept+level in a course session. ' +
      'Triggers the approval pipeline automatically. Safe to call again on re-upload.',
  })
  @ApiOkResponse({ description: 'Result uploaded successfully.Approval Pipeline activated' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        resultType: { 
          type: 'string', 
          enum: Object.values(ResultType), 
          example: ResultType.INITIAL,
          description: 'Whether this is an initial result or a resit'
        },
      },
      required: ['file', 'resultType'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
 
  async uploadFileForStudentResults(
    @User() user: UserPayload,
    @Param('courseSesnDeptLevelId') courseSesnDeptLevelId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadResultDto, 
  ) {
    const lecturerId = this.getLecturerId(user);
    // const lecturerId = "a49a1cee-6042-4c2d-b048-0520133292c3";
    // const usersub = "dd12d805-6dc4-476d-ac66-44f995e1b260"
    return await this.lecturerService.uploadFileForStudentResults(
      lecturerId,
      courseSesnDeptLevelId,
      file,
      body.resultType,
    );
  }


  @Get('requests/pending')
  @ApiOperation({
    summary: 'Get pending approval requests',
    description:
      'Returns all approval requests currently awaiting action ' +
      'for the authenticated lecturer.',
  })
  @ApiResponse({ status: 200, description: 'Pending requests returned' })
  async getPendingApprovals(@User() user: UserPayload) {
    const lecturerId = this.getLecturerId(user);
    return await this.lecturerService.getPendingApprovals(lecturerId);
  }

  @Patch('request/:requestId/respond')
  @ApiOperation({
    summary: 'Respond to approval request',
    description:
      'Lecturer approves or rejects their assigned step. ' +
      'All lower-priority steps must be APPROVED before this can be submitted.',
  })
  @ApiParam({ name: 'requestId', description: 'Approval request ID' })
  @ApiBody({ type: RespondToApprovalRequestDto })
  @ApiResponse({ status: 200, description: 'Response recorded successfully' })
  @ApiResponse({ status: 400, description: 'Lower-priority step not yet resolved' })
  @ApiResponse({ status: 404, description: 'Approval request not found' })
  respond(
    @Param('requestId') requestId: string,
    @Body() response: RespondToApprovalRequestDto,
    @User() user: UserPayload,
  ) {
    const { lecturerId } = user.userData as LecturerData;
    return this.approvalManager.respondToApprovalRequest(lecturerId,requestId, response);
  
}
}
