import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { updateProfile } from './DTO/update-profile.dto';
import { StorageService } from 'src/services/files.service';
import { extname } from 'path';
import { extension as mimeExtension } from 'mime-types';


@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaDatabaseService,
    private storage: StorageService
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        avatarKey: true || null,
      },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  };

  async updateProfile(userId: string, dto: updateProfile) {
    const updateUser = await this.prisma.user.update({
      where:{id: userId},
      data:{
        username: dto.username,
      }
    });
    return updateUser;
  };

  async createAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new NotFoundException('Файл не предоставлен');
    const ext = extname(file.originalname) || '.' + (mimeExtension(file.mimetype) || 'jpg');
    const key = `users/${userId}/avatar-${crypto.randomUUID()}${ext}`;
    await this.storage.uploadAvatar(file, userId);
    const user = await this.prisma.user.findUnique({ 
      where: {
        id: userId
      },
      select:{
        avatarKey: true
      } 
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (user.avatarKey) {
      await this.storage.deleteFile(user.avatarKey).catch(()=> {});
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key },
    });
    const avatarUrl = await this.storage.getPresignedUrl(key);
    return { avatarUrl };
  }
}