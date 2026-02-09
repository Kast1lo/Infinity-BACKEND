import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaDatabaseModule } from './prisma-database/prisma-database.module';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from './user/user.module';
import { FileSystemModule } from './file-system/file-system.module';
import { InfinityLifeModule } from './infinity-life/infinity-life.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true,
    envFilePath: '.env',
    ignoreEnvFile: false
   }), 
  PrismaDatabaseModule, AuthModule, UserModule, FileSystemModule, InfinityLifeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
