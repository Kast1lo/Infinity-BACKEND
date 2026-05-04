import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ActivatePromoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Transform(({ value }) => value?.trim().toUpperCase())
  code: string;
}
