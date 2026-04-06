import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { Priority } from 'src/generated/prisma/browser';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority = Priority.MEDIUM;

  @IsOptional()
  @IsUUID()
  columnId?: string | null;
}