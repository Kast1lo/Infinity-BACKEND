import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Обновлённый заголовок' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Новое описание задачи' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'LOW', enum: ['HIGH', 'MEDIUM', 'LOW'] })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ example: '#3498DB' })
  @IsOptional()
  @IsString()
  color?: string | null;

  @ApiPropertyOptional({ example: 'uuid-of-column' })
  @IsOptional()
  @IsString()
  columnId?: string | null;
}
