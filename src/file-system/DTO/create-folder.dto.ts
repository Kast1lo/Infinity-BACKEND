import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFolderDto {
  @ApiProperty({ example: 'My Documents', description: 'Название папки' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'uuid-of-parent-folder', description: 'ID родительской папки (null — корень)' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: false, description: 'Публичный доступ к папке' })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}
