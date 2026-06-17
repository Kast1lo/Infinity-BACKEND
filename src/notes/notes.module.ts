import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { PrismaDatabaseModule } from '../prisma-database/prisma-database.module';
import { StorageService } from '../services/files.service';

@Module({
  imports:     [ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [NotesController],
  providers:   [NotesService, StorageService],
})
export class NotesModule {}
