import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';
import env from './environment';

async function bootstrap() {
  const isWorker = process.env.IS_WORKER === 'true';

  if (isWorker) {
    // Boot up as a headless background processor (No HTTP server)
    const app = await NestFactory.createApplicationContext(AppModule);
    
    console.log('--------------------------------------------------');
    console.log('⚙️  NestJS pg-boss Background Worker Active!');
    console.log('--------------------------------------------------');

    // Keep the application context open to process background tasks
    app.enableShutdownHooks();
  } else {
    // Boot up as your standard HTTP Web API
    const app = await NestFactory.create(AppModule);
    
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());

    const swaggerConfig = new DocumentBuilder()
      .setTitle('CoHS Results Portal API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'accessToken',
      )
      .build();
    const documentFactory = () =>
      SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, documentFactory, {
      jsonDocumentUrl: 'openapi.json',
    });

    await app.listen(env.PORT, '0.0.0.0');
    console.log(`Web API running on http://localhost:${env.PORT}/api`);
  }
}

bootstrap();