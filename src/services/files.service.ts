import * as crypto from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable } from "@nestjs/common";

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
]);

@Injectable()
export class StorageService {
    private readonly S3Client: S3Client;
    private readonly bucketName: string;
    constructor(){
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
    async uploadAvatar(file: Express.Multer.File, userId: string): Promise<string> {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Аватар должен быть изображением (JPEG, PNG, GIF, WebP, BMP)');
    }
    const ext = file.mimetype.split('/')[1] || 'jpg';
    const key = `users/${userId}/avatar-${crypto.randomUUID()}.${ext}`;
    const upload = new Upload({
        client: this.S3Client,
        params: {
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'private',
        },
    });
    await upload.done();
    return key;
    }

    async deleteFile(key: string): Promise<void> {
    await this.S3Client.send(new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
    }));
    }

    async getPresignedUrl(key: string, expiresInSeconds = 3600 * 6): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
    });
    return getSignedUrl(this.S3Client, command, { expiresIn: expiresInSeconds });
    }

    async getFileStream(key: string) {
    const { Body, ContentType } = await this.S3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
    }));
    return { stream: Body as NodeJS.ReadableStream, contentType: ContentType };
    }
}
