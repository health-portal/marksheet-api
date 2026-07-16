import { Injectable } from '@nestjs/common';
import { IGradingStrategy, FacultyGradingInput, GradingResult } from './grading-strategy.interface';
import { AcademicStatus } from '@prisma/client';

@Injectable()
export class NursingGradingStrategy implements IGradingStrategy {
  evaluate(input: FacultyGradingInput): GradingResult {
    const { courses, hasPreviousRepeat } = input;
    
    // 1. Check if ANY course is still waiting for its exam or incourse uploads
    const incompleteCourses = courses.filter(c => !c.isFullyGraded);
    if (incompleteCourses.length > 0) {
      return { isFinalized: false, failedCoursesCount: 0, calculatedAverage: 0 };
    }

    let failedCount = 0;
    let totalScoreSum = 0;

    for (const course of courses) {
      const incourse = course.scores['incourse'] || 0;
      const exam = course.scores['exam'] || 0;
      const totalScore = incourse + exam;
      totalScoreSum += totalScore;

      if (totalScore < 50) { // Passing threshold is 50% 
        failedCount++;
      }
    }

    const average = courses.length > 0 ? totalScoreSum / courses.length : 0;

    // Rule 1: Withdrawal (Previous repeat history + failing at least 1 course) 
    if (hasPreviousRepeat && failedCount >= 1) {
      return {
        isFinalized: true,
        suggestedStatus: AcademicStatus.WITHDRAWN,
        failedCoursesCount: failedCount,
        calculatedAverage: average,
      };
    }

    // Rule 2: Immediate Session Repeat (Fails 4 or more courses) 
    if (failedCount >= 4) {
      return {
        isFinalized: true,
        suggestedStatus: AcademicStatus.REPEAT,
        failedCoursesCount: failedCount,
        calculatedAverage: average,
      };
    }

    // Rule 3: Resit Period (Fails 1 to 3 courses)
    // Summary is marked as NOT finalized. It will only finalize once the resit result replaces the fail.
    if (failedCount > 0 && failedCount < 4) {
      return {
        isFinalized: false, // Remains false until resit results are uploaded
        failedCoursesCount: failedCount,
        calculatedAverage: average,
      };
    }

    // Rule 4: Clean Pass
    let finalStatus; 
    if (average >= 70) {
      finalStatus = AcademicStatus.DISTINCTION; 
    } else if (average >= 60) {
      finalStatus = AcademicStatus.PASS_WITH_CREDIT; 
    }
    finalStatus = AcademicStatus.PASS; 

    return {
      isFinalized: true,
      suggestedStatus: finalStatus,
      failedCoursesCount: 0,
      calculatedAverage: average,
    };
  }
}