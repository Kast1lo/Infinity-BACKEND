import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { PrismaDatabaseModule } from '../prisma-database/prisma-database.module';

@Module({
  imports:     [ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [CalendarController],
  providers:   [CalendarService],
})
export class CalendarModule {}
