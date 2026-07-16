import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';
import { LecturerRole, UserRole, Level } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { JwtPayload } from 'jsonwebtoken';

export type AdminData = {
  adminId: string;
};

export type LecturerData = {
  lecturerId: string;
  departmentId: string;
  facultyId: string;
  designations: { role: LecturerRole; entity: string }[];
};

export type StudentData = {
  studentId: string;
  departmentId: string;
  facultyId: string;
  matricNumber: string;
  level: Level;
};

export type UserData = AdminData | LecturerData | StudentData;

export interface UserPayload extends JwtPayload {
  sub: string;
  email: string;
  userRole: UserRole;
  userData: UserData;
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export class SetPasswordBody {
  @ApiProperty()
  @IsStrongPassword()
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tokenString!: string;
}

export class SigninUserBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class RequestPasswordResetBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class ChangePasswordBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty()
  @IsStrongPassword()
  newPassword!: string;
}
