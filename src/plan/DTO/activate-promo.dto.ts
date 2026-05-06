import { IsString, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ActivatePromoDto {
  @ApiProperty({ example: 'PROMO2025', minLength: 1, maxLength: 20, description: 'Промокод (автоматически приводится к верхнему регистру)' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Transform(({ value }) => value?.trim().toUpperCase())
  code: string;
}
