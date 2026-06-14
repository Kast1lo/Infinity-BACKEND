import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({ enum: ['pulse', 'horizon'], example: 'pulse' })
  @IsIn(['pulse', 'horizon'])
  plan: 'pulse' | 'horizon';
}
