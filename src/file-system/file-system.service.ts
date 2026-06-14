import { Injectable, BadRequestException, NotFoundException, ForbiddenException, GoneException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { extname } from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
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

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/svg+xml', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif',
  'image/avif', 'image/jxl',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown', 'text/x-markdown',
  'application/json', 'application/xml', 'text/xml',
  'application/zip', 'application/x-zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/x-tar', 'application/gzip', 'application/x-bzip2',
  'audio/mpeg', 'audio/mp3', 'audio/x-mp3',
  'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/ogg', 'audio/flac', 'audio/x-flac',
  'audio/aac', 'audio/x-aac',
  'audio/mp4', 'audio/x-m4a',
  'audio/opus', 'audio/webm',
  'video/mp4', 'video/webm', 'video/ogg',
  'video/avi', 'video/x-msvideo',
  'video/quicktime', 'video/x-matroska',
  'video/x-flv', 'video/x-ms-wmv',
  'video/3gpp', 'video/3gpp2',
  'application/octet-stream',
]);

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

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Тип файла не поддерживается: ${file.mimetype}`);
    }

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

    const fileSizeBig = BigInt(file.size);
    const createdFile = await this.prisma.$transaction(async (tx) => {
      const f = await tx.file.create({
        data: {
          name:     originalName,
          path:     storagePath,
          size:     fileSizeBig,
          mimeType: file.mimetype,
          ownerId:  userId,
          folderId: folderIdValue,
          isShared: dto.isShared || false,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data:  { storageUsed: { increment: fileSizeBig } },
      });
      return f;
    });

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
    const { isShared, parentId } = dto;
    const name = dto.name.trim();
    if (!name || name.length > 255 || /[/:*?"<>|]/.test(name)) {
      throw new BadRequestException('Недопустимое имя папки');
    }

    let path = `/${name}`;

    if (parentId) {
      const parent = await this.prisma.folder.findUnique({ where: { id: parentId } });
      if (!parent || parent.ownerId !== userId) throw new NotFoundException('Родительская папка не найдена');
      path = `${parent.path}/${name}`;
      if (path.split('/').length > 10) throw new BadRequestException('Максимальная глубина папок 10');
    }

    const existing = await this.prisma.folder.findFirst({ where: { ownerId: userId, path, deletedAt: null } });
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
      where:   { ownerId: userId, parentId: null, deletedAt: null },
      include: {
        children: {
          where:   { deletedAt: null },
          include: {
            children: { where: { deletedAt: null }, include: { children: true, files: { where: { deletedAt: null } } } },
            files:    { where: { deletedAt: null } },
          },
        },
        files: { where: { deletedAt: null } },
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
      where: { ownerId: userId, folderId, deletedAt: null },
    });

    return Promise.all(
      files.map(async (file) => ({
        ...file,
        size:        file.size.toString(),
        downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
      })),
    );
  }

  // ─── Избранное (Starred) ───

  async toggleStar(userId: string, id: string, type: 'file' | 'folder') {
    if (type === 'file') {
      const file = await this.prisma.file.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
      if (!file) throw new NotFoundException('Файл не найден');
      const updated = await this.prisma.file.update({ where: { id }, data: { isStarred: !file.isStarred } });
      return { isStarred: updated.isStarred };
    }

    const folder = await this.prisma.folder.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
    if (!folder) throw new NotFoundException('Папка не найдена');
    const updated = await this.prisma.folder.update({ where: { id }, data: { isStarred: !folder.isStarred } });
    return { isStarred: updated.isStarred };
  }

  async getStarred(userId: string) {
    const [files, folders] = await Promise.all([
      this.prisma.file.findMany({
        where:   { ownerId: userId, isStarred: true, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.folder.findMany({
        where:   { ownerId: userId, isStarred: true, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const mappedFiles = await Promise.all(
      files.map(async (file) => ({
        ...file,
        size:        file.size.toString(),
        downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
      })),
    );

    return { files: mappedFiles, folders };
  }

  // ─── Поиск по файлам и папкам (по имени) ───

  async search(userId: string, query: string) {
    const q = (query ?? '').trim();
    if (q.length < 2) return { files: [], folders: [] };

    const [files, folders] = await Promise.all([
      this.prisma.file.findMany({
        where:   { ownerId: userId, deletedAt: null, name: { contains: q, mode: 'insensitive' } },
        orderBy: { updatedAt: 'desc' },
        take:    20,
      }),
      this.prisma.folder.findMany({
        where:   { ownerId: userId, deletedAt: null, name: { contains: q, mode: 'insensitive' } },
        orderBy: { updatedAt: 'desc' },
        take:    20,
      }),
    ]);

    const mappedFiles = await Promise.all(
      files.map(async (file) => ({
        ...file,
        size:        file.size.toString(),
        downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
      })),
    );

    return { files: mappedFiles, folders };
  }

  async deleteFile(key: string): Promise<void> {
    await this.S3Client.send(new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key:    key,
    }));
  }

  // Мягкое удаление: помечаем deletedAt, файлы остаются в S3 (в Корзине).
  // Хранилище НЕ освобождается, пока элемент в Корзине (как в Google Drive).
  async deleteItem(userId: string, id: string, type: 'file' | 'folder') {
    const now = new Date();

    if (type === 'file') {
      const file = await this.prisma.file.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
      if (!file) throw new NotFoundException('Файл не найден');

      await this.prisma.file.update({ where: { id }, data: { deletedAt: now } });
      return { message: 'Файл перемещён в корзину' };
    }

    if (type === 'folder') {
      const folder = await this.prisma.folder.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
      if (!folder) throw new NotFoundException('Папка не найдена');

      const { folderIds, fileIds } = await this.collectSubtree(id);
      await this.prisma.$transaction([
        this.prisma.file.updateMany({ where: { id: { in: fileIds } }, data: { deletedAt: now } }),
        this.prisma.folder.updateMany({ where: { id: { in: folderIds } }, data: { deletedAt: now } }),
      ]);
      return { message: 'Папка перемещена в корзину' };
    }

    throw new BadRequestException('Неверный тип элемента');
  }

  // Собирает все id вложенных папок и файлов (включая саму папку)
  private async collectSubtree(folderId: string): Promise<{ folderIds: string[]; fileIds: string[] }> {
    const folderIds: string[] = [folderId];
    const fileIds:   string[] = [];
    const queue = [folderId];
    while (queue.length) {
      const current = queue.shift()!;
      const files = await this.prisma.file.findMany({ where: { folderId: current }, select: { id: true } });
      fileIds.push(...files.map(f => f.id));
      const children = await this.prisma.folder.findMany({ where: { parentId: current }, select: { id: true } });
      for (const c of children) { folderIds.push(c.id); queue.push(c.id); }
    }
    return { folderIds, fileIds };
  }

  // ─── Корзина ───

  async getTrash(userId: string) {
    const [files, folders] = await Promise.all([
      this.prisma.file.findMany({
        where: {
          ownerId: userId,
          deletedAt: { not: null },
          OR: [{ folderId: null }, { folder: { deletedAt: null } }],
        },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.folder.findMany({
        where: {
          ownerId: userId,
          deletedAt: { not: null },
          OR: [{ parentId: null }, { parent: { deletedAt: null } }],
        },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);

    const mappedFiles = await Promise.all(
      files.map(async (file) => ({
        ...file,
        size:        file.size.toString(),
        downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
      })),
    );

    return { files: mappedFiles, folders };
  }

  async restoreItem(userId: string, id: string, type: 'file' | 'folder') {
    if (type === 'file') {
      const file = await this.prisma.file.findFirst({ where: { id, ownerId: userId, deletedAt: { not: null } } });
      if (!file) throw new NotFoundException('Файл не найден в корзине');

      let folderReset: { folderId?: null } = {};
      if (file.folderId) {
        const folder = await this.prisma.folder.findUnique({ where: { id: file.folderId } });
        if (!folder || folder.deletedAt) folderReset = { folderId: null };
      }
      await this.prisma.file.update({ where: { id }, data: { deletedAt: null, ...folderReset } });
      return { message: 'Файл восстановлен' };
    }

    if (type === 'folder') {
      const folder = await this.prisma.folder.findFirst({ where: { id, ownerId: userId, deletedAt: { not: null } } });
      if (!folder) throw new NotFoundException('Папка не найдена в корзине');

      const { folderIds, fileIds } = await this.collectSubtree(id);

      // Если родитель удалён/отсутствует — восстанавливаем в корень
      let parentReset: { parentId?: null; path?: string } = {};
      if (folder.parentId) {
        const parent = await this.prisma.folder.findUnique({ where: { id: folder.parentId } });
        if (!parent || parent.deletedAt) parentReset = { parentId: null, path: `/${folder.name}` };
      }

      await this.prisma.$transaction([
        this.prisma.file.updateMany({ where: { id: { in: fileIds } }, data: { deletedAt: null } }),
        this.prisma.folder.updateMany({ where: { id: { in: folderIds } }, data: { deletedAt: null } }),
        this.prisma.folder.update({ where: { id }, data: { deletedAt: null, ...parentReset } }),
      ]);
      return { message: 'Папка восстановлена' };
    }

    throw new BadRequestException('Неверный тип элемента');
  }

  // Безвозвратное удаление одного элемента из корзины (S3 + БД + освобождение квоты)
  async permanentDelete(userId: string, id: string, type: 'file' | 'folder') {
    if (type === 'file') {
      const file = await this.prisma.file.findFirst({ where: { id, ownerId: userId, deletedAt: { not: null } } });
      if (!file) throw new NotFoundException('Файл не найден в корзине');

      await this.deleteFile(file.path).catch(() => undefined);
      await this.prisma.file.delete({ where: { id } });
      await this.planService.updateStorageUsed(userId, -BigInt(file.size));
      return { message: 'Файл удалён навсегда' };
    }

    if (type === 'folder') {
      const folder = await this.prisma.folder.findFirst({ where: { id, ownerId: userId, deletedAt: { not: null } } });
      if (!folder) throw new NotFoundException('Папка не найдена в корзине');

      const { folderIds, fileIds } = await this.collectSubtree(id);
      const files = await this.prisma.file.findMany({ where: { id: { in: fileIds } }, select: { path: true, size: true } });

      let total = 0n;
      for (const f of files) { await this.deleteFile(f.path).catch(() => undefined); total += BigInt(f.size); }

      await this.prisma.$transaction([
        this.prisma.file.deleteMany({ where: { id: { in: fileIds } } }),
        this.prisma.folder.deleteMany({ where: { id: { in: folderIds } } }),
      ]);
      if (total > 0n) await this.planService.updateStorageUsed(userId, -total);
      return { message: 'Папка удалена навсегда' };
    }

    throw new BadRequestException('Неверный тип элемента');
  }

  // Очистить всю корзину пользователя
  async emptyTrash(userId: string) {
    const files = await this.prisma.file.findMany({
      where:  { ownerId: userId, deletedAt: { not: null } },
      select: { id: true, path: true, size: true },
    });

    let total = 0n;
    for (const f of files) { await this.deleteFile(f.path).catch(() => undefined); total += BigInt(f.size); }

    await this.prisma.$transaction([
      this.prisma.file.deleteMany({ where: { ownerId: userId, deletedAt: { not: null } } }),
      this.prisma.folder.deleteMany({ where: { ownerId: userId, deletedAt: { not: null } } }),
    ]);
    if (total > 0n) await this.planService.updateStorageUsed(userId, -total);
    return { message: 'Корзина очищена' };
  }

  // Авто-очистка корзины: безвозвратно удаляет всё, что лежит в ней дольше 30 дней
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldTrash(): Promise<void> {
    const threshold = new Date(Date.now() - 30 * 86_400_000);

    const files = await this.prisma.file.findMany({
      where:  { deletedAt: { lte: threshold } },
      select: { id: true, path: true, size: true, ownerId: true },
    });

    const perOwner = new Map<string, bigint>();
    for (const f of files) {
      await this.deleteFile(f.path).catch(() => undefined);
      perOwner.set(f.ownerId, (perOwner.get(f.ownerId) ?? 0n) + BigInt(f.size));
    }

    if (files.length > 0) {
      await this.prisma.file.deleteMany({ where: { id: { in: files.map(f => f.id) } } });
    }
    await this.prisma.folder.deleteMany({ where: { deletedAt: { lte: threshold } } });

    for (const [ownerId, size] of perOwner) {
      if (size > 0n) await this.planService.updateStorageUsed(ownerId, -size);
    }

    if (files.length > 0) {
      process.stdout.write(`[FileSystem] Корзина: безвозвратно удалено ${files.length} файлов\n`);
    }
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

    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await this.S3Client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }),
      );
    } catch {
      throw new NotFoundException('Файл не найден в хранилище');
    }

    const { Body, ContentType } = s3Response as any;
    res.set({
      'Content-Type':        ContentType || file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
      'Content-Length':      file.size.toString(),
      'Cache-Control':       'no-cache',
    });
    (Body as any).pipe(res);
  }

  async getFileBuffer(userId: string, id: string, res: Response) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');

    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await this.S3Client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }),
      );
    } catch {
      throw new NotFoundException('Файл не найден в хранилище');
    }

    const { Body, ContentType } = s3Response as any;
    res.set({
      'Content-Type':  ContentType || file.mimeType || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    (Body as any).pipe(res);
  }

  // Настройка публичной ссылки: вкл/выкл, срок действия, пароль
  async updateShare(
    userId: string,
    id: string,
    opts: { isShared: boolean; expiresInDays?: number | null; password?: string | null },
  ) {
    const file = await this.prisma.file.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
    if (!file) throw new NotFoundException('Файл не найден');

    // Выключение — полный сброс настроек ссылки (отзыв)
    if (!opts.isShared) {
      const updated = await this.prisma.file.update({
        where: { id },
        data:  { isShared: false, sharedAt: null, shareExpiresAt: null, sharePasswordHash: null },
        select: { id: true, name: true, isShared: true },
      });
      return { success: true, data: { ...updated, hasPassword: false, shareExpiresAt: null } };
    }

    const shareExpiresAt = opts.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 86_400_000)
      : null;

    // password: строка — установить, null — снять, undefined — оставить как было
    let passwordPatch: { sharePasswordHash?: string | null } = {};
    if (opts.password === null) passwordPatch = { sharePasswordHash: null };
    else if (typeof opts.password === 'string' && opts.password.length > 0) {
      passwordPatch = { sharePasswordHash: await argon2.hash(opts.password) };
    }

    const updated = await this.prisma.file.update({
      where: { id },
      data:  { isShared: true, sharedAt: file.sharedAt ?? new Date(), shareExpiresAt, ...passwordPatch },
      select: { id: true, name: true, isShared: true, shareExpiresAt: true, sharePasswordHash: true },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        isShared: updated.isShared,
        shareExpiresAt: updated.shareExpiresAt,
        hasPassword: !!updated.sharePasswordHash,
      },
    };
  }

  // Список расшаренных файлов пользователя
  async getSharedFiles(userId: string) {
    const files = await this.prisma.file.findMany({
      where:   { ownerId: userId, isShared: true, deletedAt: null },
      orderBy: { sharedAt: 'desc' },
    });
    const now = Date.now();
    return files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size.toString(),
      mimeType: f.mimeType,
      sharedAt: f.sharedAt,
      shareExpiresAt: f.shareExpiresAt,
      hasPassword: !!f.sharePasswordHash,
      isExpired: !!f.shareExpiresAt && f.shareExpiresAt.getTime() < now,
    }));
  }

  // Внутренний помощник: находит расшаренный файл и проверяет срок + пароль
  private async resolveSharedFile(username: string, filename: string, password?: string) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new NotFoundException('Файл не найден');

    const file = await this.prisma.file.findFirst({
      where:  { ownerId: user.id, name: filename, isShared: true, deletedAt: null },
      select: { id: true, name: true, size: true, mimeType: true, createdAt: true, path: true, shareExpiresAt: true, sharePasswordHash: true },
    });
    if (!file) throw new NotFoundException('Файл не найден');

    const expired = !!file.shareExpiresAt && file.shareExpiresAt.getTime() < Date.now();
    const requiresPassword = !!file.sharePasswordHash;
    let passwordOk = !requiresPassword;
    if (requiresPassword && typeof password === 'string' && password.length > 0) {
      passwordOk = await argon2.verify(file.sharePasswordHash!, password).catch(() => false);
    }

    return { file, expired, requiresPassword, passwordOk };
  }

  // Метаданные для публичной страницы (без файла, если истёк срок или нужен пароль)
  async getFileForShare(username: string, filename: string, password?: string) {
    const { file, expired, requiresPassword, passwordOk } = await this.resolveSharedFile(username, filename, password);

    if (expired) return { expired: true as const };
    if (requiresPassword && !passwordOk) return { requiresPassword: true as const };

    return {
      ok: true as const,
      id: file.id,
      name: file.name,
      size: file.size.toString(),
      mimeType: file.mimeType,
      createdAt: file.createdAt,
      shareExpiresAt: file.shareExpiresAt,
      requiresPassword,
      downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
    };
  }

  async streamFileForShare(username: string, filename: string, res: Response, password?: string) {
    const { file, expired, requiresPassword, passwordOk } = await this.resolveSharedFile(username, filename, password);

    if (expired) throw new GoneException('Срок действия ссылки истёк');
    if (requiresPassword && !passwordOk) throw new ForbiddenException('Требуется пароль');

    let s3Response: GetObjectCommandOutput;
    try {
      s3Response = await this.S3Client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: file.path }),
      );
    } catch {
      throw new NotFoundException('Файл не найден в хранилище');
    }
    const { Body, ContentType } = s3Response as any;

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

  // ─── Шаринг папок (публичная ссылка по slug) ───

  // Настройка публичной ссылки на папку: вкл/выкл, срок, пароль
  async updateFolderShare(
    userId: string,
    id: string,
    opts: { isShared: boolean; expiresInDays?: number | null; password?: string | null },
  ) {
    const folder = await this.prisma.folder.findFirst({ where: { id, ownerId: userId, deletedAt: null } });
    if (!folder) throw new NotFoundException('Папка не найдена');

    // Выключение — полный отзыв ссылки (slug сбрасываем тоже)
    if (!opts.isShared) {
      const updated = await this.prisma.folder.update({
        where: { id },
        data:  { isShared: false, sharedAt: null, shareExpiresAt: null, sharePasswordHash: null, shareSlug: null },
        select: { id: true, name: true, isShared: true },
      });
      return { success: true, data: { ...updated, slug: null, hasPassword: false, shareExpiresAt: null } };
    }

    const shareExpiresAt = opts.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 86_400_000)
      : null;

    // password: строка — установить, null — снять, undefined — оставить как было
    let passwordPatch: { sharePasswordHash?: string | null } = {};
    if (opts.password === null) passwordPatch = { sharePasswordHash: null };
    else if (typeof opts.password === 'string' && opts.password.length > 0) {
      passwordPatch = { sharePasswordHash: await argon2.hash(opts.password) };
    }

    const slug = folder.shareSlug ?? crypto.randomBytes(9).toString('base64url');

    const updated = await this.prisma.folder.update({
      where: { id },
      data:  { isShared: true, sharedAt: folder.sharedAt ?? new Date(), shareExpiresAt, shareSlug: slug, ...passwordPatch },
      select: { id: true, name: true, isShared: true, shareExpiresAt: true, sharePasswordHash: true, shareSlug: true },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        isShared: updated.isShared,
        slug: updated.shareSlug,
        shareExpiresAt: updated.shareExpiresAt,
        hasPassword: !!updated.sharePasswordHash,
      },
    };
  }

  // Список расшаренных папок пользователя
  async getSharedFolders(userId: string) {
    const folders = await this.prisma.folder.findMany({
      where:   { ownerId: userId, isShared: true, deletedAt: null },
      orderBy: { sharedAt: 'desc' },
    });
    const now = Date.now();
    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.shareSlug,
      sharedAt: f.sharedAt,
      shareExpiresAt: f.shareExpiresAt,
      hasPassword: !!f.sharePasswordHash,
      isExpired: !!f.shareExpiresAt && f.shareExpiresAt.getTime() < now,
    }));
  }

  // Внутренний помощник: находит расшаренную папку по slug, проверяет срок + пароль
  private async resolveSharedFolder(slug: string, password?: string) {
    const folder = await this.prisma.folder.findFirst({
      where:  { shareSlug: slug, isShared: true, deletedAt: null },
      select: { id: true, name: true, path: true, ownerId: true, shareExpiresAt: true, sharePasswordHash: true },
    });
    if (!folder) throw new NotFoundException('Папка не найдена');

    const expired = !!folder.shareExpiresAt && folder.shareExpiresAt.getTime() < Date.now();
    const requiresPassword = !!folder.sharePasswordHash;
    let passwordOk = !requiresPassword;
    if (requiresPassword && typeof password === 'string' && password.length > 0) {
      passwordOk = await argon2.verify(folder.sharePasswordHash!, password).catch(() => false);
    }

    return { folder, expired, requiresPassword, passwordOk };
  }

  // Публичный просмотр содержимого расшаренной папки (с навигацией по подпапкам через relPath)
  async getFolderForShare(slug: string, relPath: string, password?: string) {
    const { folder, expired, requiresPassword, passwordOk } = await this.resolveSharedFolder(slug, password);

    if (expired) return { expired: true as const };
    if (requiresPassword && !passwordOk) return { requiresPassword: true as const };

    // Разрешаем целевую папку внутри расшаренного поддерева, не выходя за его пределы
    const segments = (relPath ?? '').split('/').map((s) => s.trim()).filter(Boolean);
    let current = folder;
    const breadcrumb: { name: string }[] = [];

    for (const segment of segments) {
      const child = await this.prisma.folder.findFirst({
        where:  { parentId: current.id, name: segment, deletedAt: null },
        select: { id: true, name: true, path: true, ownerId: true, shareExpiresAt: true, sharePasswordHash: true },
      });
      if (!child) throw new NotFoundException('Папка не найдена');
      current = child;
      breadcrumb.push({ name: child.name });
    }

    const [childFolders, files] = await Promise.all([
      this.prisma.folder.findMany({
        where:   { parentId: current.id, deletedAt: null },
        orderBy: { name: 'asc' },
        select:  { id: true, name: true },
      }),
      this.prisma.file.findMany({
        where:   { folderId: current.id, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
    ]);

    const mappedFiles = await Promise.all(
      files.map(async (file) => ({
        id: file.id,
        name: file.name,
        size: file.size.toString(),
        mimeType: file.mimeType,
        createdAt: file.createdAt,
        downloadUrl: await this.getPresignedUrl(file.path, 3600 * 24),
      })),
    );

    return {
      ok: true as const,
      rootName: folder.name,
      currentName: current.name,
      breadcrumb,
      requiresPassword,
      folders: childFolders,
      files: mappedFiles,
    };
  }

  // Публичное скачивание всей расшаренной папки ZIP-архивом
  async streamSharedFolderZip(slug: string, res: Response, password?: string) {
    const { folder, expired, requiresPassword, passwordOk } = await this.resolveSharedFolder(slug, password);

    if (expired) throw new GoneException('Срок действия ссылки истёк');
    if (requiresPassword && !passwordOk) throw new ForbiddenException('Требуется пароль');

    const full = await this.prisma.folder.findUnique({
      where:   { id: folder.id },
      include: { files: { where: { deletedAt: null } }, children: { where: { deletedAt: null }, include: { files: true, children: true } } },
    });
    if (!full) throw new NotFoundException('Папка не найдена');

    const filesToZip: { path: string; name: string }[] = [];
    const collectFiles = async (currentFolder: any, prefix = '') => {
      for (const file of currentFolder.files) {
        if (file.deletedAt) continue;
        filesToZip.push({ path: file.path, name: `${prefix}${file.name}` });
      }
      for (const child of currentFolder.children) {
        if (child.deletedAt) continue;
        const childFolder = await this.prisma.folder.findUnique({
          where:   { id: child.id },
          include: { files: { where: { deletedAt: null } }, children: { where: { deletedAt: null } } },
        });
        if (childFolder) await collectFiles(childFolder, `${prefix}${child.name}/`);
      }
    };
    await collectFiles(full, `${full.name}/`);

    if (filesToZip.length === 0) {
      res.status(200).send('Папка пуста');
      return;
    }

    res.set({
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${full.name}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', () => { if (!res.headersSent) res.status(500).send('Ошибка создания ZIP'); });
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
}
