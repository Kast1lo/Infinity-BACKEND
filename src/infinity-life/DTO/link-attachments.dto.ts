import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class LinkAttachmentsDto {
  @ApiProperty({
    description: 'UUID файлов из хранилища, которые нужно прикрепить к задаче',
    type: [String],
    example: ['9f1b...uuid', 'a2c4...uuid'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  fileIds: string[];
}
