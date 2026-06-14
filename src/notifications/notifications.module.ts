import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports:     [PrismaDatabaseModule, JwtModule],
  controllers: [NotificationsController],
  providers:   [NotificationsService],
  exports:     [NotificationsService],
})
export class NotificationsModule {}
