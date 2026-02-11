import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from './create-task.dto';
import { IsOptional, IsString, IsEnum, IsBoolean, IsUUID } from 'class-validator';
import { Priority } from 'src/generated/prisma/browser';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;

  @IsUUID()
  @IsOptional()
  parentId?: string | null;   // null = сделать задачу корневой
}