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
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))
  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
    methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS' ],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  })

  app.use(cookieParser());

  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  const staticPath = join(
    'C:\\Users\\azomg\\Desktop\\Infinity-frontend\\infinity',
    'dist',
    'infinity',
    'browser'
  );
  if (fs.existsSync(staticPath)) {
    expressApp.use(express.static(staticPath));
    expressApp.use((req, res, next) => {
      if (
        req.url.startsWith('/auth') ||
        req.url.startsWith('/file-system') ||
        req.url.startsWith('/infinity-life') ||
        req.url.startsWith('/user') ||
        req.url.startsWith('/api')
      ) {
        return next();
      }
      const indexPath = join(staticPath, 'index.html');
      res.sendFile(indexPath);
    });
  } else {
  }

  await app.listen(4400);
  console.log('Server running on http://localhost:4400');
}

bootstrap();