import { IsEmail, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email для верификации' })
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6, description: '6-значный код из письма' })
  @IsString()
  @Length(6, 6, { message: 'Код должен содержать 6 цифр' })
  code!: string;
}
