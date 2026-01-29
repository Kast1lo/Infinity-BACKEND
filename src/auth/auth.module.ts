import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { JwtModule, JwtService } from '@nestjs/jwt';


@Module({
  imports: [ConfigModule, PrismaDatabaseModule, JwtModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaDatabaseService, ConfigService, JwtService],
})
export class AuthModule {}
