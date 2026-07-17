// src/Grading/Grading.factory.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { GradingStrategy } from '@prisma/client';
import { IGradingStrategy } from './strategies/grading-strategy.interface';
import { BmsDentistryStrategy } from './strategies/bms-dentistry.strategy';
import { NursingGradingStrategy } from './strategies/nursing-grading.strategy'; 

@Injectable()
export class GradingFactory {
  constructor(private moduleRef: ModuleRef) {}

  getStrategy(facultyName: string): IGradingStrategy {
    const normalizedName = facultyName.toLowerCase().trim();

    if (normalizedName.includes('nursing science') || normalizedName.includes('clinical sciences')) {
      return this.moduleRef.get(NursingGradingStrategy, { strict: false });
    }

    if (normalizedName.includes('basic medical sciences') || normalizedName.includes('dentistry')) {
      return this.moduleRef.get(BmsDentistryStrategy, { strict: false });
    }

    // Default fallback engine if no custom match is found
    throw new BadRequestException(
      `No specific academic Grading strategy configured for the "${facultyName}".`
    );
  }
}