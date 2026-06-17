import { Injectable, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaDatabaseService } from '../prisma-database/prisma-database.service';
import { StorageService } from '../services/files.service';
import { CreateNoteDto } from './DTO/create-note.dto';
import { UpdateNoteDto } from './DTO/update-note.dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaDatabaseService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string) {
    return this.prisma.note.findMany({
      where:   { userId },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async getOne(id: string, userId: string) {
    const note = await this.prisma.note.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException('Заметка не найдена');
    return note;
  }

  async create(userId: string, dto: CreateNoteDto) {
    return this.prisma.note.create({
      data: {
        userId,
        title:   dto.title ?? '',
        content: dto.content ?? '',
        color:   dto.color ?? null,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateNoteDto) {
    await this.getOne(id, userId);
    return this.prisma.note.update({
      where: { id },
      data: {
        ...(dto.title    !== undefined && { title: dto.title }),
        ...(dto.content  !== undefined && { content: dto.content }),
        ...(dto.color    !== undefined && { color: dto.color }),
        ...(dto.isPinned !== undefined && { isPinned: dto.isPinned }),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.getOne(id, userId);
    await this.prisma.note.delete({ where: { id } });
    return { success: true };
  }

  // Загрузка картинки в заметку: кладём в S3, заводим запись и возвращаем id,
  // по которому картинка публично отдаётся (см. streamImage).
  async uploadImage(userId: string, file: Express.Multer.File) {
    const key = await this.storage.uploadNoteImage(file, userId);
    const image = await this.prisma.noteImage.create({
      data: { userId, path: key, mimeType: file.mimetype },
    });
    return { id: image.id };
  }

  // Публичная отдача картинки по неугадываемому id (без авторизации — чтобы
  // <img> в заметке грузился кросс-доменно, как файловые шары).
  async streamImage(id: string, res: Response) {
    const image = await this.prisma.noteImage.findUnique({ where: { id } });
    if (!image) throw new NotFoundException('Картинка не найдена');

    const { stream, contentType } = await this.storage.getFileStream(image.path);
    res.set({
      'Content-Type':  contentType || image.mimeType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    stream.pipe(res);
  }
}
