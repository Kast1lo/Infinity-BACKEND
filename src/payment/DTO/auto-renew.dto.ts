import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class AutoRenewDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;
}
