import { Injectable } from '@nestjs/common';
import { IGradingStrategy, FacultyGradingInput, GradingResult } from './grading-strategy.interface';
import { Level, AcademicStatus } from '@prisma/client';

@Injectable()
export class BmsDentistryStrategy implements IGradingStrategy {
  evaluate(input: FacultyGradingInput): GradingResult {
    const { level, courses, hasPreviousRepeat } = input;

    // 1. If any registered course does not have its complete parts, exit early
    const incompleteCourses = courses.filter(c => !c.isFullyGraded);
    if (incompleteCourses.length > 0) {
      return { isFinalized: false, failedCoursesCount: 0, calculatedAverage: 0 };
    }

    let failedCount = 0;
    let totalScoreSum = 0;

    for (const course of courses) {
      const incourse = course.scores['incourse'] || 0;
      const exam = course.scores['exam'] || 0; 
      const practical = course.scores['practical']; 
      
      const totalScore = incourse + exam;
      totalScoreSum += totalScore;

      let isFailed = totalScore < 50; // Below 50 is a fail 

      // Part 4 Clinical Failure Rule: Failing practical module means failing the course 
      if (level === Level.LVL_400 && practical !== undefined) {
        const practicalPassMark = 15; // Passing standard for clinical module
        if (practical < practicalPassMark) {
          isFailed = true;
        }
      }

      // Exempt non-promotional courses 
      const isExempt = ['CLI340', 'CLI350', 'CLI360'].includes(course.courseCode.replace(/\s+/g, ''));
      
      if (isFailed && !isExempt) {
        failedCount++;
      }
    }

    const average = courses.length > 0 ? totalScoreSum / courses.length : 0;

    // BMS Part 2 & Part 3 Rules 
    if (level === Level.LVL_200 || level === Level.LVL_300) {
      // 1. Withdrawal Rule: Fails 3 courses  OR fails twice (fails while repeating) 
      if (failedCount >= 3 || (failedCount > 0 && hasPreviousRepeat)) {
        return {
          isFinalized: true,
          suggestedStatus: AcademicStatus.WITHDRAWN,
          failedCoursesCount: failedCount,
          calculatedAverage: average,
        };
      }

      // 2. Repeat Rule: Fails exactly 2 courses 
      if (failedCount === 2) {
        return {
          isFinalized: true,
          suggestedStatus: AcademicStatus.REPEAT,
          failedCoursesCount: failedCount,
          calculatedAverage: average,
        };
      }

      // 3. Resit Rule: Fails exactly 1 course 
      if (failedCount === 1) {
        return {
          isFinalized: false, // Remains pending until resit result is processed
          failedCoursesCount: failedCount,
          calculatedAverage: average,
        };
      }
    }

    // Pass rules
    let finalStatus; 
    if (average >= 70) {
      finalStatus = AcademicStatus.DISTINCTION; 
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