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

  getStrategy(strategyType: GradingStrategy): IGradingStrategy {
    switch (strategyType) {
      case GradingStrategy.NURSING:
        return this.moduleRef.get(NursingGradingStrategy, { strict: false });
      case GradingStrategy.MEDICINE: 
        return this.moduleRef.get(BmsDentistryStrategy, { strict: false });
      case GradingStrategy.DENTISTRY: 
        return this.moduleRef.get(BmsDentistryStrategy, { strict: false });
      default:
        throw new BadRequestException(`Grading strategy ${strategyType} is not supported.`);
    }
  }
}