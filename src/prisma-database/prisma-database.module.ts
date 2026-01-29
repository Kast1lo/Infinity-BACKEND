import { Module } from '@nestjs/common';
import { PrismaDatabaseService } from './prisma-database.service';
import { PrismaDatabaseController } from './prisma-database.controller';

@Module({
  controllers: [PrismaDatabaseController],
  providers: [PrismaDatabaseService],
  exports: [PrismaDatabaseService, PrismaDatabaseModule],
})
export class PrismaDatabaseModule {}
