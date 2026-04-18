import { Module } from '@nestjs/common';
import { InfinityLifeService } from './infinity-life.service';
import { InfinityLifeController } from './infinity-life.controller';
import { JwtModule } from '@nestjs/jwt/dist/jwt.module';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { ConfigModule } from '@nestjs/config/dist/config.module';
import { PlanModule } from 'src/plan/plan.module';

@Module({
  imports: [PlanModule, ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [InfinityLifeController],
  providers: [InfinityLifeService],
})
export class InfinityLifeModule {}
