import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { extname } from 'path';
import * as mime from 'mime-types';
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
import { get } from 'http';

@Injectable()
export class FileSystemService {
    private readonly S3Client: S3Client;
    private readonly bucketName: string;
    constructor(
        private readonly prisma: PrismaDatabaseService
    ){
        this.bucketName = process.env.SELECTEL_BUCKET!;
        this.S3Client = new S3Client({
            region: process.env.SELECTEL_POOL,
            endpoint: process.env.SELECTEL_ENDPOINT,
                credentials:{
                    accessKeyId: process.env.SELECTEL_ACCESS_KEY!,
                    secretAccessKey: process.env.SELECTEL_SECRET_KEY!
                },
            forcePathStyle: true
        });
    }

    async uploadFile(userId: string, file: Express.Multer.File, dto: UploadFileDto) {
      const isShared = dto.isShared === true;
      if (!file) {
        throw new BadRequestException('Файл не найден');
      }
      if(file.size > 100 * 1024 * 1024) throw new BadRequestException('Максимальный размер файла 100 МБ');

      const ext = extname(file.originalname) || '.' + (mimeExtension(file.mimetype) || 'bin');
      const fileName = `${crypto.randomUUID()}${ext}`;

      let folderPath = '/';
      let folderIdValue: string | null = null;

      if(dto.folderId) {
        const folder = await this.prisma.folder.findUnique({
          where: {id: dto.folderId},
        });
        if(!folder || folder.ownerId !== userId) throw new NotFoundException('Папка не найдена');
        folderPath = folder.path;
        folderIdValue = dto.folderId;
      }

      const storagePath = `files/${folderPath}/${fileName}`;
      const existing = await this.prisma.file.findFirst({
        where:{
          ownerId: userId, 
          folderId: folderIdValue,
          name: file.originalname
        }
      });
      if(existing) throw new BadRequestException('Файл с таким именем уже существует');
      const upload = new Upload({
        client: this.S3Client,
        params:{
          Bucket: this.bucketName,
          Key: storagePath,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'private'
        }
      });
      await upload.done();
      const createdFile = await this.prisma.file.create({
        data:{
          name: file.originalname,
          path: storagePath,
          size: BigInt(file.size),
          mimeType: file.mimetype,
          ownerId: userId,
          folderId: folderIdValue,
          isShared: dto.isShared || false,
        }
      });
      const downloadUrl = await this.getPresignedUrl(storagePath, 3600 * 24);
      return {...createdFile, downloadUrl,
        size: createdFile.size.toString()
      };
    }
    private async getPresignedUrl(key: string, expiresIn: number = 3600 * 24) {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      return getSignedUrl(this.S3Client, command, { expiresIn });
    }

    async createFolder(userId: string, dto: CreateFolderDto) {
      const {name, isShared, parentId} = dto;
      if(!name || /[^\w- ]/.test(name)) throw new BadRequestException('Недопустимое имя папки');
      let path = `/${name}`;
      if(parentId) {
        const parent = await this.prisma.folder.findUnique({
          where: {id: parentId}
        });
        if(!parent || parent.ownerId !== userId) throw new NotFoundException('Родительская папка не найдена');
        path = `${parent.path}/${name}`;
        if (path.split('/').length > 10) throw new BadRequestException('Максимальная глубина папок 10');
      }
      const existing = await this.prisma.folder.findFirst({
        where: {ownerId: userId, path}
      });
      if(existing) throw new BadRequestException('Папка с таким именем уже существует');
      return this.prisma.folder.create({
        data:{
          name,
          path,
          ownerId: userId,
          parentId: parentId || null,
          isShared: isShared || false
        }
      });
    }

    async getFolderTree(userId: string) {
      const trees = await this.prisma.folder.findMany({
        where: {
          ownerId: userId,
          parentId: null
        },
        include: {
          children:{
            include:{
              children: true,
              files: true
            },
          },
          files: true
        }
      });
      const addUrls = (folders: any[]) => {
        folders.forEach(folder => {
          folder.files = folder.files.map((file: any) => ({
            ...file,
            size: file.size.toString(),
            downloadUrl: this.getPresignedUrl(file.path, 3600 * 24)
          }));
          if(folder.children && folder.children.length > 0) {
            addUrls(folder.children);
          }
        });  
      };
      addUrls(trees);
      return trees;
    }
    
    async getFilesInFolder(userId: string, folderId: string | null) {
      const files = await this.prisma.file.findMany({
        where:{
          ownerId: userId,
          folderId
        }
      });
      return files.map(file => ({
        ...file,
        downloadUrl: this.getPresignedUrl(file.path, 3600 * 24),
        size: file.size.toString()
      }));
    }

    async deleteFile(key: string): Promise<void> {
    await this.S3Client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
    }));
    }

    async deleteItem(userId: string, id: string, type: 'file' | 'folder') {
      if (type === 'file') {
        const file = await this.prisma.file.findUnique({ where: { id } });
        if (!file || file.ownerId !== userId) throw new NotFoundException('Файл не найден');
        await this.deleteFile(file.path);  // From Selectel
        await this.prisma.file.delete({ where: { id } });  // From БД
        return { message: 'Файл удалён' };
      } else if (type === 'folder') {
        const folder = await this.prisma.folder.findUnique({
          where: { id },
          include: { children: true, files: true },
        });
        if (!folder || folder.ownerId !== userId) throw new NotFoundException('Папка не найдена');

        await this.deleteFolderRecursive(folder);

        return { message: 'Папка удалена' };
      }
    }

    private async deleteFolderRecursive(folder: any) {
      for (const file of folder.files) {
        await this.deleteFile(file.path);
        await this.prisma.file.delete({ where: { id: file.id } });
      }
      for (const child of folder.children) {
        const childFull = await this.prisma.folder.findUnique({
          where: { id: child.id },
          include: { children: true, files: true },
        });
        await this.deleteFolderRecursive(childFull);
      }
      await this.prisma.folder.delete({ where: { id: folder.id } });
    }
  }
  

