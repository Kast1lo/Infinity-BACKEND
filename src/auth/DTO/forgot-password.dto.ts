import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email аккаунта для сброса пароля' })
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;
}
