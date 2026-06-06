import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GigachatService } from './gigachat.service';

@Module({
  imports:   [ConfigModule],
  providers: [GigachatService],
  exports:   [GigachatService],
})
export class GigachatModule {}
