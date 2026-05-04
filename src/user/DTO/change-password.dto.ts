import { IsString, MinLength, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6,  { message: 'Новый пароль должен содержать минимум 6 символов' })
  @MaxLength(128, { message: 'Новый пароль не должен превышать 128 символов' })
  newPassword!: string;
}
