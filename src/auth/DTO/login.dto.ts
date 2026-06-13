import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class loginRequest {
  @ApiProperty({ example: 'john_doe', minLength: 3, maxLength: 30, description: 'Имя пользователя' })
  @IsString({ message: 'Имя должно быть строкой' })
  @IsNotEmpty({ message: 'имя обязательно к заполнению' })
  @MinLength(3, { message: 'имя должно содеражть не менее 3 символов' })
  @MaxLength(30, { message: 'имя не должно превышать 30 символов' })
  username: string;

  @ApiProperty({ example: 'securePass123', minLength: 6, maxLength: 128, description: 'Пароль' })
  @IsString({ message: 'пароль должен быть строкой' })
  @IsNotEmpty({ message: 'пароль обязателен к заполнению' })
  @MinLength(6, { message: 'пароль должен содеражть не менее 6 символов' })
  @MaxLength(128, { message: 'пароль не должен превышать 128 символов' })
  passwordHash: string;

  @ApiProperty({ example: true, required: false, description: 'Запомнить пользователя (продлевает сессию до 30 дней)' })
  @IsOptional()
  @IsBoolean({ message: 'rememberMe должно быть булевым значением' })
  rememberMe?: boolean;
}
