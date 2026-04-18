import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { extname } from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { CreateFolderDto } from './DTO/create-folder.dto';
import { UploadFileDto } from './DTO/upload-file.dto';
import { extension as mimeExtension } from 'mime-types';
import { Response } from 'express';
import archiver from 'archiver';
import type { Express } from 'express';
import { PlanService } from '../plan/plan.service';

@Injectable()
export class FileSystemService {
  private readonly S3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    private readonly prisma:       PrismaDatabaseService,
    private readonly planService:  PlanService,
  ) {
    this.bucketName = process.env.SELECTEL_BUCKET!;
    this.S3Client   = new S3Client({
      region:   process.env.SELECTEL_POOL,
      endpoint: process.env.SELECTEL_ENDPOINT,
      credentials: {
        accessKeyId:     process.env.SELECTEL_ACCESS_KEY!,
        secretAccessKey: process.env.SELECTEL_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(userId: string, file: Express.Multer.File, dto: UploadFileDto) {
    if (!file) throw new BadRequestException('Файл не найден');
    if (file.size > 100 * 1024 * 1024) throw new BadRequestException('Максимальный размер файла 100 МБ');

    // ─── Проверка лимита хранилища ───
    await this.planService.checkStorageLimit(userId, BigInt(file.size));

    const originalName  = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext           = extname(file.originalname) || '.' + (mimeExtension(file.mimetype) || 'bin');
    const fileName      = `${crypto.randomUUID()}${ext}`;

    let folderPath    = '/';
    let folderIdValue: string | null = null;

    if (dto.folderId) {
      const folder = await this.prisma.folder.findUnique({ where: { id: dto.folderId } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Папка не найдена');
      folderPath    = folder.path;
      folderIdValue = dto.folderId;
    }

    const storagePath = `files/${folderPath}/${fileName}`;

    const upload = new Upload({
      client: this.S3Client,
      params: {
        Bucket:      this.bucketName,
        Key:         storagePath,
        Body:        file.buffer,
        ContentType: file.mimetype,
        ACL:         'private',
      },
    });
    await upload.done();

    const createdFile = await this.prisma.file.create({
      data: {
        name:     originalName,
        path:     storagePath,
        size:     BigInt(file.size),
        mimeType: file.mimetype,
        ownerId:  userId,
        folderId: folderIdValue,
        isShared: dto.isShared || false,
      },
    });

    // ─── Обновить занятое хранилище ───
    await this.planService.updateStorageUsed(userId, BigInt(file.size));

    const downloadUrl = await this.getPresignedUrl(storagePath, 3600 * 24);
    return { ...createdFile, downloadUrl, size: createdFile.size.toString() };
  }

  async uploadFiles(userId: string, files: Express.Multer.File[], dto: UploadFileDto) {
    const results: any[] = [];
    for (const file of files) {
      const result = await this.uploadFile(userId, file, dto);
      results.push(result);
    }
    return results;
  }

  async getPresignedUrl(key: string, expiresIn: number = 3600 * 24) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key:    key,
    });
    return getSignedUrl(this.S3Client, command, { expiresIn });
  }

  async createFolder(userId: string, dto: CreateFolderDto) {
    const { name, isShared, parentId } = dto;

    if (!name || /[^\w\u0400-\u04FF\- ]/.test(name)) {
      throw new BadRequestException('Недопустимое имя папки');
    }

    let path = `/${name}`;

    if (parentId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: parentId } });
      if (!parent || parent.ownerId !== userId) throw new NotFoundException('Родительская папка не найдена');
      path = `${parent.path}/${name}`;
      if (path.split('/').length > 10) throw new BadRequestException('Максимальная глубина папок 10');
    }

    const existing = await this.prisma.folder.findFirst({ where: { ownerId: userId, path } });
    if (existing) throw new BadRequestException('Папка с таким именем уже существует');

    return this.prisma.folder.create({
      data: {
        name,
        path,
        ownerId:  userId,
        parentId: parentId || null,
        isShared: isShared || false,
      },
    });
  }

  async getFolderTree(userId: string) {
    const trees = await this.prisma.folder.findMany({
      where:   { ownerId: userId, parentId: null },
      include: {
        children: { include: { children: true, files: true } },
        files:    true,
      },
    });

    const addUrlsAndConvertSize = async (folders: any[]) => {
      for (const folder of folders) {
        folder.files = await Promise.all(
          folder.files.map(async (file: any) => ({
            ...file,
            size:        file.size.toString(),
            downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
          })),
        );
        if (folder.children?.length > 0) await addUrlsAndConvertSize(folder.children);
      }
    };

    await addUrlsAndConvertSize(trees);
    return trees;
  }

  async getFilesInFolder(userId: string, folderId: string | null) {
    const files = await this.prisma.file.findMany({
      where: { ownerId: userId, folderId },
    });

    return Promise.all(
      files.map(async (file) => ({
        ...file,
        size:        file.size.toString(),
        downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
      })),
    );
  }

  async deleteFile(key: string): Promise<void> {
    await this.S3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key:    key,
    }));
  }

  async deleteItem(userId: string, id: string, type: 'file' | 'folder') {
    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');

      await this.deleteFile(file.path);
      await this.prisma.file.delete({ where: { id } });

      // ─── Освободить хранилище ───
      await this.planService.updateStorageUsed(userId, -BigInt(file.size));

      return { message: 'Файл удалён' };
    }

    if (type === 'folder') {
      const folder = await this.prisma.folder.findUnique({
        where:   { id },
        include: { files: true, children: { include: { files: true, children: true } } },
      });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Папка не найдена');

      const totalSize = await this.getFolderTotalSize(folder);
      await this.deleteFolderRecursive(folder);

      // ─── Освободить хранилище ───
      if (totalSize > 0n) {
        await this.planService.updateStorageUsed(userId, -totalSize);
      }

      return { message: 'Папка удалена' };
    }

    throw new BadRequestException('Неверный тип элемента');
  }

  // Считаем суммарный размер всех файлов в папке рекурсивно
  private async getFolderTotalSize(folder: any): Promise<bigint> {
    let total = 0n;
    for (const file of folder.files) {
      total += BigInt(file.size);
    }
    for (const child of folder.children) {
      const childFull = await this.prisma.folder.findUnique({
        where:   { id: child.id },
        include: { files: true, children: { include: { files: true, children: true } } },
      });
      if (childFull) total += await this.getFolderTotalSize(childFull);
    }
    return total;
  }

  private async deleteFolderRecursive(folder: any) {
    for (const file of folder.files) {
      await this.deleteFile(file.path);
      await this.prisma.file.delete({ where: { id: file.id } });
    }
    for (const child of folder.children) {
      const childFull = await this.prisma.folder.findUnique({
        where:   { id: child.id },
        include: { files: true, children: { include: { files: true, children: true } } },
      });
      if (childFull) await this.deleteFolderRecursive(childFull);
    }
    await this.prisma.folder.delete({ where: { id: folder.id } });
  }

  async downloadFolder(userId: string, folderId: string, res: Response) {
    const folder = await this.prisma.folder.findUnique({
      where:   { id: folderId },
      include: { files: true, children: { include: { files: true, children: true } } },
    });
    if (!folder || folder.ownerId !== userId) throw new NotFoundException('Папка не найдена');

    const filesToZip: { path: string; name: string }[] = [];

    const collectFiles = async (current: any, path = '') => {
      for (const file of current.files) {
        filesToZip.push({ path: file.path, name: `${path}${file.name}` });
      }
      for (const child of current.children) {
        const childFolder = await this.prisma.folder.findUnique({
          where:   { id: child.id },
          include: { files: true, children: true },
        });
        if (childFolder) await collectFiles(childFolder, `${path}${child.name}/`);
      }
    };

    await collectFiles(folder, `${folder.name}/`);

    if (filesToZip.length === 0) {
      res.status(200).send('Папка пуста');
      return;
    }

    res.set({
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${folder.name}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => { if (!res.headersSent) res.status(500).send('Ошибка создания ZIP'); });
    archive.pipe(res);

    for (const file of filesToZip) {
      try {
        const { Body } = await this.S3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }));
        const chunks: Buffer[] = [];
        for await (const chunk of Body as NodeJS.ReadableStream) chunks.push(Buffer.from(chunk));
        archive.append(Buffer.concat(chunks), { name: file.name });
      } catch {
        archive.append(Buffer.from('Ошибка чтения файла'), { name: `${file.name}.error.txt` });
      }
    }

    archive.finalize();
  }

  async downloadFile(userId: string, id: string, res: Response) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');

    const { Body, ContentType } = await this.S3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }),
    );

    res.set({
      'Content-Type':        ContentType || file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length':      file.size.toString(),
      'Cache-Control':       'no-cache',
    });
    (Body as any).pipe(res);
  }

  async getFileBuffer(userId: string, id: string, res: Response) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');

    const { Body, ContentType } = await this.S3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }),
    );

    res.set({
      'Content-Type':              ContentType || file.mimeType || 'application/octet-stream',
      'Access-Control-Allow-Origin': 'http://localhost:4200',
      'Cache-Control':             'no-cache',
    });
    (Body as any).pipe(res);
  }

  async getFileForShare(username: string, filename: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const file = await this.prisma.file.findFirst({
      where:  { ownerId: user.id, name: filename },
      select: { id: true, name: true, size: true, mimeType: true, createdAt: true, path: true },
    });
    if (!file) throw new NotFoundException('Файл не найден');

    return { ...file, size: file.size.toString() };
  }

  async streamFileForShare(username: string, filename: string, res: Response) {
    const file = await this.getFileForShare(username, filename);

    const { Body, ContentType } = await this.S3Client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }),
    );

    res.set({
      'Content-Type':        ContentType || file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.name}"`,
      'Content-Length':      file.size.toString(),
    });
    (Body as NodeJS.ReadableStream).pipe(res);
  }

  async renameItem(userId: string, id: string, type: 'file' | 'folder', name: string) {
    if (!name || name.trim().length === 0) throw new BadRequestException('Имя не может быть пустым');

    if (type === 'file') {
      const file = await this.prisma.file.findUnique({ where: { id } });
      if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');
      return this.prisma.file.update({ where: { id }, data: { name: name.trim() } });
    }

    if (type === 'folder') {
      const folder = await this.prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) throw new NotFoundException('Папка не найдена');

      const newPath = folder.parentId
        ? folder.path.replace(/[^/]+$/, name.trim())
        : `/${name.trim()}`;

      const existing = await this.prisma.folder.findFirst({
        where: { ownerId: userId, path: newPath, NOT: { id } },
      });
      if (existing) throw new BadRequestException('Папка с таким именем уже существует');

      return this.prisma.folder.update({ where: { id }, data: { name: name.trim(), path: newPath } });
    }

    throw new BadRequestException('Неверный тип элемента');
  }

  async moveFile(userId: string, fileId: string, targetFolderId: string | null) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');

    const updated = await this.prisma.file.update({
      where: { id: fileId },
      data:  { folderId: targetFolderId },
    });
    return { ...updated, size: updated.size.toString() };
  }
}