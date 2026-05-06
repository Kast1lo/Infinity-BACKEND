import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateColumnDto {
  @ApiProperty({ example: 'Готово', description: 'Новое название колонки' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
