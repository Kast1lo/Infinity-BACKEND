import { Module } from '@nestjs/common';
import { FileSystemService } from './file-system.service';
import { FileSystemController } from './file-system.controller';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { JwtModule, JwtService } from '@nestjs/jwt';

@Module({
  imports: [ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [FileSystemController, ],
  providers: [FileSystemService, PrismaDatabaseService, JwtService],
})
export class FileSystemModule {}
