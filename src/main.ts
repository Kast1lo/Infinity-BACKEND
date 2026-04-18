import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    transform:           true,
    whitelist:           true,
    forbidNonWhitelisted: true,
  }));

  app.enableCors({
    origin:         process.env.ALLOWED_ORIGIN || 'http://localhost:4200',
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.use(cookieParser());

  const expressApp  = app.getHttpAdapter().getInstance() as express.Express;
  const staticPath  = join(
    'C:\\Users\\azomg\\Desktop\\Infinity-frontend\\infinity',
    'dist',
    'infinity',
    'browser',
  );

  if (fs.existsSync(staticPath)) {
    expressApp.use(express.static(staticPath));

    expressApp.use((req, res, next) => {
      const apiPrefixes = [
        '/auth',
        '/file-system',
        '/infinity-life',
        '/user',
        '/plan',
        '/api',
      ];

      const isApi = apiPrefixes.some(prefix => req.url.startsWith(prefix));
      if (isApi) return next();

      const indexPath = join(staticPath, 'index.html');
      res.sendFile(indexPath);
    });
  }

    const port = process.env.APPLICATION_PORT || 4400;
    await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}

bootstrap();