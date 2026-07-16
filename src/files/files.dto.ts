import { ApiProperty } from '@nestjs/swagger';
import { CreateCoursesRes } from 'src/courses/courses.responses';
import {
  CreateLecturersRes,
  RegisterStudentsRes,
  UploadResultsRes,
} from 'src/lecturers/lecturers.responses';
import { CreateStudentRes } from 'src/students/students.responses';

export enum FileErrorMessage {
  INVALID_HEADERS = 'Invalid headers',
  INVALID_FILE_TYPE = 'Invalid file type',
  INVALID_FILE_CONTENT = 'Invalid file content',
  INVALID_FILE_METADATA = 'Invalid file metadata',
  INVALID_FILE_USER = 'Invalid file user',
  INVALID_FILE_ID = 'Invalid file id',
}

export interface FileMetadata {
  courseSessionId?: string;
  altHeaderMappings?: Record<string, string>;
  error?: FileErrorMessage;
  response?:
    | CreateCoursesRes
    | RegisterStudentsRes
    | UploadResultsRes
    | CreateStudentRes
    | CreateLecturersRes;
}

export class RowValidationError {
  @ApiProperty()
  row!: number;

  @ApiProperty({ type: [String] })
  errorMessages!: string[];
}

export class ParseCsvData<T extends object> {
  @ApiProperty()
  numberOfRows!: number;

  @ApiProperty({ type: [Object] })
  validRows!: T[];

  @ApiProperty({ type: [RowValidationError] })
  invalidRows!: RowValidationError[];
}

export class ProvideAltHeaderMappingsBody {
  @ApiProperty({ type: [Object] })
  altHeaderMappings!: Record<string, string>;
}
