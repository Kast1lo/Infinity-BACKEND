import { Module } from '@nestjs/common';
import { FileSystemService } from './file-system.service';
import { FileSystemController } from './file-system.controller';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PlanModule } from 'src/plan/plan.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PlanModule, ConfigModule, PrismaDatabaseModule, JwtModule, NotificationsModule],
  controllers: [FileSystemController, ],
  providers: [FileSystemService, PrismaDatabaseService, JwtService],
  exports: [FileSystemService],
})
export class FileSystemModule {}
