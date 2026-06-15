import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';
import { PrismaDatabaseModule } from '../prisma-database/prisma-database.module';
import { AdminGuard } from './guards/admin.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageService } from '../services/files.service';

@Module({
  imports:     [PrismaDatabaseModule, NotificationsModule],
  controllers: [PlanController],
  providers:   [PlanService, AdminGuard, StorageService],
  exports:     [PlanService],
})
export class PlanModule {}
