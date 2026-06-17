import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNoteDto {
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
}
