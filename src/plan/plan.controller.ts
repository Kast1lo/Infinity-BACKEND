import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard.guard';
import { AdminGuard } from './guards/admin.guard';
import { ActivatePromoDto } from './DTO/activate-promo.dto';
import { GeneratePromoDto } from './DTO/generate-promo.dto';

@Controller('plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  // GET /plan/info — информация о тарифе текущего юзера
  @Get('info')
  @UseGuards(JwtAuthGuard)
  getPlanInfo(@Req() req: any) {
    return this.planService.getPlanInfo(req.user.userId);
  }

  // POST /plan/activate-promo — активировать промокод
  @Post('activate-promo')
  @UseGuards(JwtAuthGuard)
  activatePromo(@Req() req: any, @Body() dto: ActivatePromoDto) {
    return this.planService.activatePromoCode(req.user.userId, dto.code);
  }

  // POST /plan/admin/generate-promo — сгенерировать промокоды (только админ)
  @Post('admin/generate-promo')
  @UseGuards(JwtAuthGuard)
  generatePromo(@Body() dto: GeneratePromoDto) {
    return this.planService.generatePromoCodes(dto.count, dto.note, dto.source);
  }
}