import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateNoteDto {
  @ApiPropertyOptional({ description: 'Заголовок заметки', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Содержимое заметки (rich-text HTML)' })
  @IsOptional()
  @IsString()
  @MaxLength(200_000)
  content?: string;

  @ApiPropertyOptional({ description: 'Цвет метки заметки' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ description: 'Закреплена ли заметка' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
