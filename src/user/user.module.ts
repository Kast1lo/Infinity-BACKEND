import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaDatabaseModule } from 'src/prisma-database/prisma-database.module';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from 'src/auth/auth.service';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { StorageService } from 'src/services/files.service';
import { FileSystemService } from 'src/file-system/file-system.service';
import { MailModule } from 'src/mail/mail.module';
import { MailService } from 'src/mail/mail.service';
import { PlanModule } from 'src/plan/plan.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [ConfigModule, PrismaDatabaseModule, JwtModule, MailModule, PlanModule, NotificationsModule],
  controllers: [UserController],
  providers: [UserService, AuthService, PrismaDatabaseService, ConfigService, JwtService, StorageService, FileSystemService, MailService],
})
export class UserModule {}
