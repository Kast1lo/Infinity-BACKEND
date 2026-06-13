import { IsBoolean, IsOptional, IsInt, Min, Max, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateShareDto {
  @ApiProperty({ example: true, description: 'Включить/выключить публичный доступ' })
  @IsBoolean({ message: 'isShared должно быть булевым значением' })
  isShared: boolean;

  @ApiProperty({ example: 7, required: false, nullable: true, description: 'Срок действия в днях (null/не задано — без срока)' })
  @IsOptional()
  @IsInt({ message: 'expiresInDays должно быть числом' })
  @Min(1, { message: 'минимум 1 день' })
  @Max(3650, { message: 'максимум 3650 дней' })
  expiresInDays?: number | null;

  @ApiProperty({ example: 'secret', required: false, nullable: true, description: 'Пароль на ссылку (null — убрать пароль)' })
  @IsOptional()
  @IsString({ message: 'пароль должен быть строкой' })
  @MaxLength(128, { message: 'пароль не должен превышать 128 символов' })
  password?: string | null;
}
