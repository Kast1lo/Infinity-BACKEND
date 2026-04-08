import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class UpdateColumnDto {
  @IsString()
  @IsNotEmpty()
  name: string | undefined;
}