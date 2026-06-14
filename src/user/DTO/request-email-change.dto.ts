import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailChangeDto {
  @ApiProperty({ example: 'new@example.com', description: 'Новый email' })
  @IsEmail({}, { message: 'Некорректный email' })
  newEmail: string;

  @ApiProperty({ example: 'currentPassword', description: 'Текущий пароль для подтверждения' })
  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(1, { message: 'Введите текущий пароль' })
  password: string;
}
