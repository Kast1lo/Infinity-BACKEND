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
    Credential: true,
    methods: [ 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS' ]
  })
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 4400);
  console.log('API is running on http://localhost:4400');
}
bootstrap();
