import { Module } from '@nestjs/common';
import { InfinityLifeService } from './infinity-life.service';
import { InfinityLifeController } from './infinity-life.controller';

@Module({
  controllers: [InfinityLifeController],
  providers: [InfinityLifeService],
})
export class InfinityLifeModule {}
