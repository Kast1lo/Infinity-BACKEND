import { IsEmail, IsNotEmpty, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email аккаунта' })
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6, description: '6-значный код из письма' })
  @IsString()
  @Length(6, 6, { message: 'Код должен содержать 6 цифр' })
  code!: string;

  @ApiProperty({ example: 'newSecurePass123', minLength: 6, maxLength: 128, description: 'Новый пароль (6–128 символов)' })
  @IsString({ message: 'Пароль должен быть строкой' })
  @IsNotEmpty({ message: 'Пароль обязателен к заполнению' })
  @MinLength(6, { message: 'Пароль должен содержать не менее 6 символов' })
  @MaxLength(128, { message: 'Пароль не должен превышать 128 символов' })
  passwordHash!: string;
}
