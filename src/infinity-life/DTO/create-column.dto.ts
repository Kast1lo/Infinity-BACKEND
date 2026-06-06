import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateColumnDto {
  @ApiProperty({ example: 'uuid-проекта', description: 'ID проекта, к которому относится колонка' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 'В работе', description: 'Название колонки' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
