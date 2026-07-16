import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LecturerRole, Level } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddAdminBody {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateAdminBody {
  @ApiProperty()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  phone?: string;
}


export class UpdateLecturerDesignationDto {
  @ApiProperty({
    description: 'The role to assign to the lecturer',
    enum: LecturerRole,
    example: LecturerRole.HOD,
  })
  @IsEnum(LecturerRole)
  role!: LecturerRole;
 
  @ApiPropertyOptional({
    description: 'Student level — required only when role is PART_ADVISER',
    enum: Level,
    example: Level.LVL_300,
  })
  @IsOptional()
  @IsEnum(Level)
  part?: Level;
}

export class ActivateFixtureLecturersBody {
  @ApiProperty({
    description: 'Emails of lecturer accounts to activate with the provided password',
    type: [String],
    example: ['dean.e2e123456@example.com', 'coord.e2e123456@example.com'],
  })
  @IsEmail({}, { each: true })
  emails!: string[];

  @ApiProperty({
    description: 'Test password to assign to all listed lecturers',
    example: 'TestPass123!',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
 