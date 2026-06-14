import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { PlanModule } from 'src/plan/plan.module';
import { OllamaModule } from 'src/ollama/ollama.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports:     [PlanModule, OllamaModule, ConfigModule, PrismaDatabaseModule, JwtModule, NotificationsModule],
  controllers: [ProjectController],
  providers:   [ProjectService],
  exports:     [ProjectService],
})
export class ProjectModule {}
