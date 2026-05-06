import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';
import * as fs from 'fs';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    transform:           true,
    whitelist:           true,
    forbidNonWhitelisted: true,
  }));

  const isProd        = process.env.NODE_ENV === 'production';
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:4200';

  app.enableCors({
    origin:         allowedOrigin,
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.use(cookieParser());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Infinity API')
    .setDescription(
      'REST API для платформы Infinity Vault — облачное хранилище файлов и Kanban-доска.\n\n' +
      'Аутентификация выполняется через cookie (`access_token` / `refresh_token`). ' +
      'Для защищённых эндпоинтов передайте валидный `access_token` в cookie или через Bearer-заголовок.'
    )
    .setVersion('1.0')
    .addCookieAuth('access_token')
    .addTag('Auth', 'Регистрация, вход, OAuth Google, верификация email')
    .addTag('User', 'Профиль пользователя, аватар, смена пароля')
    .addTag('File System', 'Загрузка файлов, папки, публичные ссылки')
    .addTag('Infinity Life', 'Kanban-доска: задачи, подзадачи, колонки')
    .addTag('Plan', 'Тарифные планы, промокоды')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { withCredentials: true },
  });

  if (isProd) {
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    const staticPath = process.env.FRONTEND_DIST_PATH || join(__dirname, '..', 'frontend', 'browser');

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
  }

  const port = process.env.APPLICATION_PORT || 4400;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger UI:  http://localhost:${port}/api/docs`);
  console.log(`NODE_ENV=${process.env.NODE_ENV ?? 'undefined'} | CORS origin=${allowedOrigin}`);
}

bootstrap();
