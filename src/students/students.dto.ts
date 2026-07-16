import { ApiProperty } from '@nestjs/swagger';
import { Gender, Level } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { IsSequentialAcademicYear } from 'src/college/college.dto';

export class CreateStudentBody {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  matricNumber!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  otherName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  department!: string;

  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @IsEnum(Level)
  level!: Level;

  @ApiProperty()
  @IsSequentialAcademicYear()
  admissionYear!: string;

  @ApiProperty({ enum: Gender })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  degree!: string;
}

export class UpdateStudentBody {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  otherName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @IsEnum(Level)
  level?: Level;

  @ApiProperty({ enum: Gender, required: false })
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty()
  @IsSequentialAcademicYear()
  @IsOptional()
  admissionYear?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  degree?: string;
}
