import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateColumnDto {
  @ApiProperty({ example: 'В работе', description: 'Название колонки' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
