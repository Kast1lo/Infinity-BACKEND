import { IsString, IsOptional, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Запуск нового продукта', minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Подготовка к релизу MVP за 2 недели', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '#FF5733', description: 'Цвет проекта в формате #RRGGBB' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color должен быть hex-цветом вида #RRGGBB' })
  color?: string;

  @ApiPropertyOptional({ example: 'rocket', description: 'Имя иконки' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;
}
