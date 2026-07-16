import { ApiProperty } from '@nestjs/swagger';
import { Level } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsEnum, IsUUID } from 'class-validator';
import { IsSequentialAcademicYear } from 'src/college/college.dto';

export class CreateSessionBody {
  @ApiProperty()
  @IsSequentialAcademicYear()
  academicYear!: string;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @IsDate()
  @Type(() => Date)
  startDate!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  @IsDate()
  @Type(() => Date)
  endDate!: Date;
}

export class UpdateSessionBody {
  @ApiProperty({ nullable: true })
  @IsSequentialAcademicYear()
  academicYear?: string;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class AssignCourseToSessionBody {
  @ApiProperty()
  @IsUUID('4')
  courseId!: string;

  @ApiProperty()
  @IsUUID('4')
  gradingSystemId!: string;
}

export class UpdateCourseInSessionBody {
  @ApiProperty()
  @IsUUID('4')
  gradingSystemId!: string;
}

export class AssignLecturersBody {
  @ApiProperty()
  @IsArray()
  @IsUUID('4', { each: true })
  lecturerIds!: string[];

  @ApiProperty()
  @IsUUID()
  coordinatorId!: string;
}

export class AssignDeptAndLevelBody {
  @ApiProperty()
  @IsUUID('4')
  departmentId!: string;

  @ApiProperty({ enum: Level })
  @IsEnum(Level)
  level!: Level;
}
