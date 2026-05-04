import { IsString, IsEnum } from 'class-validator';

export class DeleteItemDto {
  @IsEnum(['file', 'folder'])
  type!: 'file' | 'folder';
}
