import { IsString, IsOptional } from 'class-validator';

export class MoveTaskDto {
  @IsOptional()
  @IsString()
  columnId: string | null;
}
