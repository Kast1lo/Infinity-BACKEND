import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
  }))
  app.enableCors({
    origin: 'http://localhost:4200',
    credentials: true,
    methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS' ],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  })
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 4400);
  console.log('API is running on http://localhost:4400');
}
bootstrap();
