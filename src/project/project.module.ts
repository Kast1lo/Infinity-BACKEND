import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { PlanModule } from 'src/plan/plan.module';
import { GigachatModule } from 'src/gigachat/gigachat.module';

@Module({
  imports:     [PlanModule, GigachatModule, ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [ProjectController],
  providers:   [ProjectService],
  exports:     [ProjectService],
})
export class ProjectModule {}
