import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalStatus, Level, LecturerRole, PipelineScope } from '@prisma/client';

// ============================================================
// APPROVAL REQUEST RESPONSE
// ============================================================

export class RespondToApprovalRequestDto {
  @ApiProperty({
    description: 'The LecturerDesignation ID of the responding lecturer',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  lecturerDesignationId!: string;

  @ApiProperty({
    description: 'The approval decision',
    enum: ['APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  @IsEnum(['APPROVED', 'REJECTED'])
  approvalStatus!: Extract<ApprovalStatus, 'APPROVED' | 'REJECTED'>;

  @ApiPropertyOptional({
    description: 'Optional feedback — required when rejecting',
    example: 'Results are inconsistent with attendance records',
  })
  @IsOptional()
  @IsString()
  feedback?: string;
}

// ============================================================
// PIPELINE TEMPLATE STEP
// ============================================================

export class CreatePipelineStepDto {
  @ApiProperty({
    description: 'The role required at this step',
    enum: LecturerRole,
    example: LecturerRole.HOD,
  })
  @IsEnum(LecturerRole)
  role!: LecturerRole;

  @ApiProperty({
    description: 'Order of approval — lower number goes first',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  priority!: number;

  @ApiProperty({
    description: 'Whether this step applies to the offering or taking department',
    enum: PipelineScope,
    example: PipelineScope.OFFERING_DEPT,
  })
  @IsEnum(PipelineScope)
  scope!: PipelineScope;

  @ApiPropertyOptional({
    description: 'Student level — only required when role is PART_ADVISER',
    enum: Level,
    example: Level.LVL_300,
  })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;
}

// ============================================================
// CREATE PIPELINE TEMPLATE
// ============================================================

export class CreatePipelineTemplateDto {
  @ApiProperty({
    description: 'Name of the pipeline template',
    example: 'Science Faculty Standard Pipeline',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the template',
    example: 'Used for all inter-departmental courses in the Science faculty',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Lecturer ID of the Dean creating this template',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  createdByDeanId!: string;

  @ApiProperty({
    description: 'Ordered list of approval steps',
    type: [CreatePipelineStepDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePipelineStepDto)
  steps!: CreatePipelineStepDto[];
}

// ============================================================
// ACTIVATE PIPELINE TEMPLATE
// ============================================================

export class ActivateTemplateDto {
  @ApiProperty({
    description: 'ID of the template to activate',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @ApiProperty({
    description: 'Lecturer ID of the Dean activating this template',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  activatedByDeanId!: string;
}

// ============================================================
// DEACTIVATE PIPELINE TEMPLATE
// ============================================================

export class DeactivateTemplateDto {
  @ApiProperty({
    description: 'Lecturer ID of the Dean deactivating the template',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  deanId!: string;
}
