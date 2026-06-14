import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { RobokassaService } from './robokassa.service';
import { PrismaDatabaseModule } from '../prisma-database/prisma-database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [PrismaDatabaseModule, NotificationsModule],
  controllers: [PaymentController],
  providers:   [PaymentService, RobokassaService],
  exports:     [PaymentService],
})
export class PaymentModule {}
