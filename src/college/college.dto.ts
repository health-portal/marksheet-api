import { ApiProperty } from '@nestjs/swagger';
import { Level } from '@prisma/client';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  IsEnum,
} from 'class-validator';

export class CreateFacultyBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateDepartmentBody {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  shortName!: string;

  @ApiProperty()
  @IsUUID()
  facultyId!: string;

  @ApiProperty({ enum: Level })
  @IsEnum(Level)
  maxLevel!: Level;
}

export function IsSequentialAcademicYear(
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSequentialAcademicYear',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: string, _args: ValidationArguments) {
          const match = /^(\d{4})\/(\d{4})$/.exec(value);
          if (!match) return false;

          const start = parseInt(match[1], 10);
          const end = parseInt(match[2], 10);
          return end === start + 1;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'academicYear must be in the format YYYY/YYYY and consecutive (e.g., 2020/2021)';
        },
      },
    });
  };
}
