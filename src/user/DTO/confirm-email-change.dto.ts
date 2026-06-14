import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailChangeDto {
  @ApiProperty({ example: '123456', description: '6-значный код подтверждения' })
  @IsString({ message: 'Код должен быть строкой' })
  @Length(6, 6, { message: 'Код должен содержать 6 цифр' })
  code: string;
}
