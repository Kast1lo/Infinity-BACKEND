import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email пользователя' })
  @IsString({ message: 'E-mail должен быть строкой' })
  @IsNotEmpty({ message: 'E-mail обязателен к заполнению' })
  @IsEmail({}, { message: 'некорректный формат электронной почты' })
  email: string;

  @ApiProperty({ example: 'securePass123', minLength: 6, maxLength: 128, description: 'Пароль (6–128 символов)' })
  @IsString({ message: 'пароль должен быть строкой' })
  @IsNotEmpty({ message: 'пароль обязателен к заполнению' })
  @MinLength(6, { message: 'пароль должен содеражть не менее 6 символов' })
  @MaxLength(128, { message: 'пароль не должен превышать 128 символов' })
  passwordHash: string;

  @ApiProperty({ example: 'john_doe', minLength: 3, maxLength: 30, description: 'Имя пользователя (3–30 символов)' })
  @IsString({ message: 'Имя должно быть строкой' })
  @IsNotEmpty({ message: 'имя обязательно к заполнению' })
  @MinLength(3, { message: 'имя должно содеражть не менее 3 символов' })
  @MaxLength(30, { message: 'имя не должно превышать 30 символов' })
  username: string;
}
