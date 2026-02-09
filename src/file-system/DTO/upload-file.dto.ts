import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UploadFileDto {
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}