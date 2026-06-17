import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class UpsertCalendarNoteDto {
  @ApiProperty({ description: 'Дата дня в формате YYYY-MM-DD' })
  @IsString()
  @Matches(DATE_RE, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({ description: 'Содержимое мини-заметки (HTML)' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  content?: string;
}

export class CreateCalendarTaskDto {
  @ApiProperty({ description: 'Дата дня в формате YYYY-MM-DD' })
  @IsString()
  @Matches(DATE_RE, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @ApiProperty({ description: 'Название задачи' })
  @IsString()
  @MaxLength(300)
  title: string;
}

export class UpdateCalendarTaskDto {
  @ApiPropertyOptional({ description: 'Название задачи' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ description: 'Выполнена ли задача' })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
