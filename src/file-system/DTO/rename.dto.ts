import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameDto {
  @ApiProperty({ example: 'new-filename.pdf', maxLength: 255, description: 'Новое имя файла или папки' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
