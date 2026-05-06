import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePromoDto {
  @ApiProperty({ example: 10, minimum: 1, maximum: 100, description: 'Количество промокодов для генерации' })
  @IsInt()
  @Min(1)
  @Max(100)
  count: number;

  @ApiPropertyOptional({ example: 'Для партнёрской кампании', description: 'Заметка для администратора' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ example: 'partner_campaign_2025', description: 'Источник / кампания' })
  @IsOptional()
  @IsString()
  source?: string;
}
