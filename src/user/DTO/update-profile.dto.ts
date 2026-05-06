import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class updateProfile {
  @ApiPropertyOptional({ example: 'new_username', minLength: 3, maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'Имя должно быть строкой' })
  @IsNotEmpty({ message: 'имя обязательно к заполнению' })
  @MinLength(3, { message: 'имя должно содеражть не менее 3 символов' })
  @MaxLength(30, { message: 'имя не должно превышать 30 символов' })
  username?: string;

  @ApiPropertyOptional({ example: 'new@example.com' })
  @IsOptional()
  @IsString({ message: 'E-mail должен быть строкой' })
  @IsNotEmpty({ message: 'E-mail обязателен к заполнению' })
  @IsEmail({}, { message: 'некорректный формат электронной почты' })
  email?: string;
}
