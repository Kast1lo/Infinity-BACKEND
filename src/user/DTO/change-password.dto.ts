import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'oldPassword123', description: 'Текущий пароль' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'newSecurePass456', minLength: 6, maxLength: 128, description: 'Новый пароль' })
  @IsString()
  @MinLength(6, { message: 'Новый пароль должен содержать минимум 6 символов' })
  @MaxLength(128, { message: 'Новый пароль не должен превышать 128 символов' })
  newPassword!: string;
}
