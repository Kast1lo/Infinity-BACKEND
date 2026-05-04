import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RenameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
