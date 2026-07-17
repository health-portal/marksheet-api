import { ApiProperty, PickType } from '@nestjs/swagger';
import {
  CreateLecturerBody,
  RegisterStudentBody,
  UploadResultRow,
} from './lecturers.dto';
import { ParseCsvData } from 'src/files/files.dto';
import {
  CourseSesnDeptAndLevelResponse,
  CourseSessionResponse,
  EnrollmentResponse,
  LecturerResponse,
  ResultResponse,
  StudentResponse,
} from 'src/prisma/prisma.responses';
import { DeptResultStatus, Level } from '@prisma/client';

export class CreateLecturerRes extends CreateLecturerBody {
  @ApiProperty()
  isCreated!: boolean;
}

// export class CreateLecturersRes extends ParseCsvData<CreateLecturerBody> {
//   @ApiProperty({ type: [CreateLecturerRes] })
//   lecturers: CreateLecturerRes[];
// }
export class CreateLecturersRes extends ParseCsvData<CreateLecturerBody> {
  @ApiProperty({ type: [CreateLecturerRes] })
  lecturers!: CreateLecturerRes[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  success!: number;

  @ApiProperty()
  failed!: number;
}
export class UploadResultsRes extends ParseCsvData<UploadResultRow> {
  @ApiProperty() studentsUploadedFor: string[];
  @ApiProperty() studentsNotFound: string[];
  @ApiProperty() total!: number;
  @ApiProperty() success!: number;
  @ApiProperty() failed!: number;
}

export class RegisterStudentsRes extends ParseCsvData<RegisterStudentBody> {
  @ApiProperty() registeredStudents: string[];
  @ApiProperty() unregisteredStudents: string[];
  @ApiProperty() total!: number;
  @ApiProperty() success!: number;
  @ApiProperty() failed!: number;
}


class Student extends PickType(StudentResponse, [
  'id',
  'firstName',
  'otherName',
  'lastName',
  'matricNumber',
  'level',
]) {
  @ApiProperty({ readOnly: true })
  department!: string;
}

class Result extends PickType(ResultResponse, [
  'id',
  'scores',
  'evaluations',
  'type',
]) {}

export class EnrollmentRes extends PickType(EnrollmentResponse, [
  'id',
  'status',
]) {
  @ApiProperty({ type: Student, readOnly: true })
  student!: Student;
}

export class EnrollmentWithResultRes extends EnrollmentRes {
  @ApiProperty({ type: [Result], readOnly: true })
  results!: Result[];
}

export class LecturerProfileRes extends PickType(LecturerResponse, [
  'id',
  'firstName',
  'otherName',
  'lastName',
  'title',
  'qualification',
  'gender',
  'phone',
]) {
  @ApiProperty({ readOnly: true })
  email!: string;

  @ApiProperty({ readOnly: true })
  department!: string;
}

export class UploadStatusRes {
  @ApiProperty({ example: true })
  uploaded!: boolean;

  @ApiProperty({ example: '2026-07-09T11:06:50.509Z' })
  uploadedAt!: string;

  @ApiProperty({ example: true })
  uploadedByMe!: boolean;

  @ApiProperty({ example: 'https://res.cloudinary.com/.../file' })
  file!: string;
}

class DeptAndLevel extends PickType(CourseSesnDeptAndLevelResponse, ['level']) {
  @ApiProperty({ example: '1bb40f07-0fd5-4f76-a775-d017540102fe' })
  courseSesnDeptLevelId!: string;

  @ApiProperty({ example: 'nursing science' })
  department!: string;

  @ApiProperty({ example: 'dd7e1a95-40ef-4267-a81b-726575d8318f' })
  departmentId!: string;

  @ApiProperty({ enum: Level, example: Level.LVL_200 })
  level!: Level;

  @ApiProperty({ enum: DeptResultStatus, example: 'APPROVED' })
  status!: DeptResultStatus;

  @ApiProperty({ type: UploadStatusRes, required: false })
  uploadStatus?: UploadStatusRes;
}

export class LecturerCourseSessionRes extends PickType(CourseSessionResponse, [
  'id',
]) {
  @ApiProperty({ example: '910bf1ad-2d50-4a16-9be9-66c11719ffe1' })
  courseSessionId!: string;

  @ApiProperty({ example: 'NUR201' })
  courseCode!: string;

  @ApiProperty({ example: 'Intro to complex nursing' })
  courseTitle!: string;

  @ApiProperty({ example: '2024/2025' })
  session!: string;

  @ApiProperty({ example: false })
  isApproved!: boolean;

  @ApiProperty({ type: [DeptAndLevel] })
  deptLevels!: DeptAndLevel[];
}
