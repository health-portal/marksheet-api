import { Inject, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { createClient } from 'smtpexpress';
import {
  ParseFilePayload,
  ProcessResultsPayload,
  QueueTable,
  SendEmailPayload,
} from './message-queue.dto';
import { FilesModule } from 'src/files/files.module';
import { FilesService } from 'src/files/files.service';
import { JwtModule } from '@nestjs/jwt';
import { TokensModule } from 'src/tokens/tokens.module';
import { RedisProvider } from './redis.provider';
import Redis from 'ioredis';
import env from 'src/environment';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [
    FilesModule,
    JwtModule.register({ secret: env.JWT_SECRET, global: true }),
    PrismaModule,
    TokensModule,
  ],
  providers: [RedisProvider],
})
export class MessageQueueWorkersModule
  implements OnModuleInit, OnModuleDestroy
{
  private readonly emailClient: ReturnType<typeof createClient>;
  private workers: Worker[] = [];

  constructor(
    private readonly filesService: FilesService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {
    this.emailClient = createClient({
      projectId:     env.SMTPEXPRESS_PROJECT_ID,
      projectSecret: env.SMTPEXPRESS_PROJECT_SECRET,
    });
  }

  async onModuleInit() {
    this.workers = [
      this.createEmailWorker(),
      this.createFileWorker(),
      this.createResultsWorker(),
    ];
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
  }

  // ============================================================
  // EMAIL WORKER
  // ============================================================

  private createEmailWorker(): Worker {
    const worker = new Worker(
    QueueTable.EMAILS,
    async (job) => {
      console.log(`[EMAIL WORKER] Picked up job ${job.id}`);
      const { content, toEmail, subject } = job.data as SendEmailPayload;
      try {
        await this.emailClient.sendApi.sendMail({
          subject,
          message: content,
          sender: {
            name:  'Obafemi Awolowo University - College of Health Sciences',
            email: env.SMTPEXPRESS_SENDER_EMAIL,
          },
          recipients: [toEmail],
        });
        console.log(`[EMAIL WORKER] Sent to ${toEmail}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[EMAIL WORKER] Failed: ${errorMessage}`);
        throw error;
      }
    },
    {
      connection:  this.redis,
      concurrency: 3,
    },
  );

  // Add event listeners to see what's happening
  worker.on('completed', (job) => console.log(`[EMAIL WORKER] Job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`[EMAIL WORKER] Job ${job?.id} failed: ${err.message}`));
  worker.on('error', (err) => console.error(`[EMAIL WORKER] Worker error: ${err.message}`));
  worker.on('ready', () => console.log(`[EMAIL WORKER] Worker ready and listening`));

  return worker;
  }

  // ============================================================
  // FILE WORKER
  // ============================================================

  private createFileWorker(): Worker {
    return new Worker(
      QueueTable.FILES,
      async (job) => {
        const payload = job.data as ParseFilePayload;
        console.log(`[FILE WORKER] Processing job ${job.id}`);
        try {
          await this.filesService.parseFile(payload);
          console.log(`[FILE WORKER] Job ${job.id} completed`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[FILE WORKER] Job ${job.id} failed: ${errorMessage}`);
          throw error;
        }
      },
      {
        connection: this.redis,
        concurrency: 1,
      },
    );
  }

  // ============================================================
  // RESULTS WORKER
  // ============================================================

  private createResultsWorker(): Worker {
    return new Worker(
      QueueTable.PROCESS_RESULTS,
      async (job) => {
        const payload = job.data as ProcessResultsPayload;
        console.log(`[RESULTS WORKER] Processing job ${job.id}`);
        try {
          await this.filesService.processResultUpload(payload);
          console.log(`[RESULTS WORKER] Job ${job.id} completed`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[RESULTS WORKER] Job ${job.id} failed: ${errorMessage}`);
          throw error;
        }
      },
      {
        connection: this.redis,
        concurrency: 1, // process one result file at a time
      },
    );
  }
}