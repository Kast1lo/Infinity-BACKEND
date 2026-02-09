import { Controller } from '@nestjs/common';
import { InfinityLifeService } from './infinity-life.service';

@Controller('infinity-life')
export class InfinityLifeController {
  constructor(private readonly infinityLifeService: InfinityLifeService) {}
}
