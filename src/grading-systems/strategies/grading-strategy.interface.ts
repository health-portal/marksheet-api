// src/Grading/strategies/Grading-strategy.interface.ts
import { Level, AcademicStatus } from '@prisma/client';

export interface CourseGradingInput {
  courseSessionId: string;
  courseCode: string;
  scores: Record<string, number>;
  isFullyGraded: boolean; // Flag showing if incourse + exam + clinic are all uploaded
}

export interface FacultyGradingInput {
  studentId: string;
  sessionId: string;
  level: Level;
  courses: CourseGradingInput[];
  hasPreviousRepeat: boolean; 
}

export interface GradingResult {
  isFinalized: boolean; // false if waiting for missing grades or pending resits
  suggestedStatus?: AcademicStatus; 
  failedCoursesCount: number;
  calculatedAverage: number;
}

export interface IGradingStrategy {
  evaluate(input: FacultyGradingInput): GradingResult;
}