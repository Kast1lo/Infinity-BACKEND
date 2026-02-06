import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from 'src/auth/auth.service';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { StorageService } from 'src/services/files.service';

@Module({
  imports: [ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [UserController],
  providers: [UserService, AuthService, PrismaDatabaseService, ConfigService, JwtService, StorageService],
})
export class UserModule {}
