import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSubtaskDto {
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
