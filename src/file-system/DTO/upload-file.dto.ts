import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UploadFileDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}