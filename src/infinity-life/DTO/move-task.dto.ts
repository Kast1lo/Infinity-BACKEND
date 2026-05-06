import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MoveTaskDto {
  @ApiPropertyOptional({ example: 'uuid-of-target-column', description: 'ID целевой колонки (null — убрать из колонки)' })
  @IsOptional()
  @IsString()
  columnId: string | null;
}
