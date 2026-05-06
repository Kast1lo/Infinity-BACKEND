import { IsString, IsOptional, IsDateString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ example: 'Разработать новый модуль', minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'Подробное описание задачи...', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ example: 'HIGH', enum: ['HIGH', 'MEDIUM', 'LOW'], description: 'Приоритет задачи' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ example: 'uuid-of-column', description: 'ID колонки (null — без колонки)' })
  @IsOptional()
  @IsString()
  columnId?: string | null;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.000Z', description: 'Срок выполнения (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ example: '#FF5733', description: 'Цвет метки в формате #RRGGBB' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color должен быть hex-цветом вида #RRGGBB' })
  color?: string | null;
}
