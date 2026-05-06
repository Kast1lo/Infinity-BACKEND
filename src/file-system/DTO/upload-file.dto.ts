import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadFileDto {
  @ApiPropertyOptional({ example: 'uuid-of-folder', description: 'ID папки назначения (null — корень)' })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({ example: false, description: 'Сделать файл публично доступным' })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}
