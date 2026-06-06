import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaDatabaseModule } from './prisma-database/prisma-database.module';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from './user/user.module';
import { FileSystemModule } from './file-system/file-system.module';
import { InfinityLifeModule } from './infinity-life/infinity-life.module';
import { ProjectModule } from './project/project.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PlanModule } from './plan/plan.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    ConfigModule.forRoot({
      isGlobal:      true,
      envFilePath:   ['.env.local', '.env'],
      ignoreEnvFile: false,
    }),
    PrismaDatabaseModule,
    AuthModule,
    UserModule,
    FileSystemModule,
    InfinityLifeModule,
    ProjectModule,
    PlanModule,
  ],
  controllers: [AppController],
  providers:   [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
