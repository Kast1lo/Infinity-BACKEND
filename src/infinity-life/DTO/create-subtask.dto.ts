import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsUUID()
  taskId: string;
}