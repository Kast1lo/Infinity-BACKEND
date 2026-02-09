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
      const storagePath = `files/${userId}/${fileName}`;
      const existing = await this.prisma.file.findFirst({
        where:{
          ownerId: userId, path: storagePath
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
}
