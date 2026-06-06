import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiGenerateTasksDto {
  @ApiProperty({
    example:     'Запуск нового продукта',
    description: 'Название проекта (для подсказки AI). Если не указано — берётся из проекта',
    minLength:   1,
    maxLength:   120,
    required:    false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    example:     'Подготовить MVP за 2 недели: дизайн, бэкенд, интеграции, релиз',
    description: 'Описание проекта для AI. Чем подробнее — тем лучше задачи',
    minLength:   10,
    maxLength:   2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({
    description: 'Создавать ли подзадачи (по умолчанию true)',
    default:     true,
  })
  @IsOptional()
  includeSubtasks?: boolean;
}
