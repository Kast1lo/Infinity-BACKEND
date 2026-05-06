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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
} from '@nestjs/swagger';

@ApiTags('Plan')
@ApiCookieAuth('access_token')
@Controller('plan')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @ApiOperation({ summary: 'Получить информацию о тарифе и хранилище' })
  @ApiResponse({
    status: 200,
    description: 'Данные о текущем плане',
    schema: {
      example: {
        planType: 'spark',
        planLabel: 'Spark',
        planExpiresAt: '2025-02-01T00:00:00.000Z',
        isFrozen: false,
        frozenAt: null,
        daysLeft: 7,
        freezeDaysLeft: null,
        storage: { usedBytes: 1048576, limitBytes: 5368709120, percent: 0.02 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Не аутентифицирован' })
  @Get('info')
  @UseGuards(JwtAuthGuard)
  getPlanInfo(@Req() req: any) {
    return this.planService.getPlanInfo(req.user.userId);
  }

  @ApiOperation({ summary: 'Активировать промокод' })
  @ApiBody({ type: ActivatePromoDto })
  @ApiResponse({
    status: 201, description: 'Промокод активирован, план обновлён',
    schema: { example: { message: 'Промокод активирован. Тариф: eternal' } },
  })
  @ApiResponse({ status: 400, description: 'Промокод недействителен или уже использован' })
  @Post('activate-promo')
  @UseGuards(JwtAuthGuard)
  activatePromo(@Req() req: any, @Body() dto: ActivatePromoDto) {
    return this.planService.activatePromoCode(req.user.userId, dto.code);
  }

  @ApiOperation({ summary: '[Admin] Сгенерировать промокоды' })
  @ApiBody({ type: GeneratePromoDto })
  @ApiResponse({
    status: 201, description: 'Промокоды сгенерированы',
    schema: { example: { codes: ['ABC123', 'DEF456'], count: 2 } },
  })
  @ApiResponse({ status: 403, description: 'Доступ запрещён — требуется права администратора' })
  @Post('admin/generate-promo')
  @UseGuards(JwtAuthGuard, AdminGuard)
  generatePromo(@Body() dto: GeneratePromoDto) {
    return this.planService.generatePromoCodes(dto.count, dto.note, dto.source);
  }
}
