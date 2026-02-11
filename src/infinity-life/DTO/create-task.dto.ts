import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { Priority } from 'src/generated/prisma/browser';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;
    
  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;

  @IsUUID()
  @IsOptional()
  parentId?: string | null;         

}