import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ActivateFixtureLecturersBody,
  AddAdminBody,
  UpdateAdminBody,
  UpdateLecturerDesignationDto,
} from './admin.dto';
import { LecturerDesignation, LecturerRole, UserRole } from '@prisma/client';
import { MessageQueueService } from 'src/message-queue/message-queue.service';
import { AdminProfileRes } from './admin.responses';
import * as argon2 from 'argon2';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async addAdmin({ email, name }: AddAdminBody) {
    const user = await this.prisma.user.create({
      data: {
        email,
        role: UserRole.ADMIN,
        admin: { create: { name } },
      },
    });

    await this.messageQueueService.enqueueSetPasswordEmail({
      isActivateAccount: true,
      tokenPayload: {
        email: user.email,
        role: UserRole.ADMIN,
        sub: user.id,
      },
    });
  }

  async getAdmins(): Promise<AdminProfileRes[]> {
    const admins = await this.prisma.admin.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        user: { select: { email: true, password: true } },
      },
    });

    return admins.map((admin) => ({
      id: admin.id,
      name: admin.name,
      phone: admin.phone,
      email: admin.user.email,
      isActivated: !!admin.user.password,
    }));
  }

  async getProfile(adminId: string): Promise<AdminProfileRes> {
    const admin = await this.prisma.admin.findUniqueOrThrow({
      where: { id: adminId },
      select: {
        id: true,
        name: true,
        phone: true,
        user: { select: { email: true, password: true } },
      },
    });

    return {
      id: admin.id,
      name: admin.name,
      phone: admin.phone,
      email: admin.user.email,
      isActivated: !!admin.user.password,
    };
  }

  async updateProfile(adminId: string, body: UpdateAdminBody) {
    await this.prisma.admin.update({
      data: { name: body.name, phone: body.phone },
      where: { id: adminId },
    });
  }
  async updateLecturerDesignation(
    lecturerId: string,
    body: UpdateLecturerDesignationDto,
  ): Promise<LecturerDesignation> {
    if (body.role === LecturerRole.PART_ADVISER && !body.part) {
      throw new BadRequestException(
        'A specific Level (part) is required when assigning the PART_ADVISER role',
      );
    }

    const lecturer = await this.prisma.lecturer.findUnique({
      where: { id: lecturerId },
      select: { 
        id: true, 
        departmentId: true,
        designations: { // Matches schema field name
          select: { role: true, part: true },
        },
      },
    });

    if (!lecturer) {
      throw new NotFoundException(`Lecturer with ID ${lecturerId} not found`);
    }

    if (body.role !== LecturerRole.COURSE_LECTURER) {
      const existingAdminRole = lecturer.designations.find(
        (d) => d.role !== LecturerRole.COURSE_LECTURER && d.role !== body.role
      );

      if (existingAdminRole) {
        throw new BadRequestException(
          `This lecturer already holds the administrative role of '${existingAdminRole.role}'. ` +
          `They cannot be assigned the role of '${body.role}'. A lecturer can only hold 'COURSE_LECTURER' and at most one other administrative role.`,
        );
      }
    }

    const assignedDept = await this.prisma.lecturerDesignation.findFirst({
      where: {
        entity: lecturer.departmentId,
        role: body.role,
        part: body.part ?? null,
        // Exclude current lecturer so they can update their own designation details safely
        NOT: {
          lecturerId: lecturer.id,
        },
      },
    });

    if (assignedDept) {
      throw new BadRequestException(
        `The role ${body.role} is already assigned to another lecturer in this department for the specified part.`,
      );
    }

    // Upsert the designation safely
    const updatedLecturer = await this.prisma.lecturerDesignation.upsert({
      where: {
        designation: {
          entity: lecturer.departmentId,
          role: body.role,
          lecturerId: lecturer.id,
        },
      },
      update: {
        part: body.part ?? null, 
      },
      create: {
        entity: lecturer.departmentId,
        role: body.role,
        lecturerId: lecturer.id,
        part: body.part ?? null,
      },
    });

    return updatedLecturer;
  }

  async activateFixtureLecturers({ emails, password }: ActivateFixtureLecturersBody) {
    const uniqueEmails = [...new Set(emails.map((email) => email.trim().toLowerCase()))];

    if (!uniqueEmails.length) {
      throw new BadRequestException('emails must contain at least one lecturer email');
    }

    const users = await this.prisma.user.findMany({
      where: {
        role: UserRole.LECTURER,
        email: { in: uniqueEmails },
      },
      select: { id: true, email: true, password: true },
    });

    const foundByEmail = new Set(users.map((user) => user.email.toLowerCase()));
    const notFoundEmails = uniqueEmails.filter((email) => !foundByEmail.has(email));

    const hash = await argon2.hash(password);
    let activatedCount = 0;
    let skippedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const user of users) {
        if (user.password) {
          skippedCount += 1;
          continue;
        }

        await tx.user.update({
          where: { id: user.id },
          data: { password: hash },
        });

        activatedCount += 1;
      }
    });

    return {
      activatedCount,
      skippedCount,
      notFoundEmails,
    };
  }
}
