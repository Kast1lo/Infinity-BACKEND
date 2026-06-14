import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth-guard.guard';
import { PaymentService } from './payment.service';
import { SubscribeDto } from './DTO/subscribe.dto';
import { AutoRenewDto } from './DTO/auto-renew.dto';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly payment: PaymentService) {}

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Оформить подписку Pulse/Horizon (первый платёж привязывает карту)' })
  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@Req() req: any, @Body() dto: SubscribeDto) {
    return this.payment.createSubscription(req.user.userId, dto.plan);
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Купить тариф Eternal (разовая оплата через СБП)' })
  @Post('eternal')
  @UseGuards(JwtAuthGuard)
  eternal(@Req() req: any) {
    return this.payment.createEternal(req.user.userId);
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Включить/выключить автопродление' })
  @Post('auto-renew')
  @UseGuards(JwtAuthGuard)
  autoRenew(@Req() req: any, @Body() dto: AutoRenewDto) {
    return this.payment.setAutoRenew(req.user.userId, dto.enabled);
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Отвязать карту (прекратить автосписания)' })
  @Delete('card')
  @UseGuards(JwtAuthGuard)
  unbind(@Req() req: any) {
    return this.payment.unbindCard(req.user.userId);
  }

  // ─────────────── Коллбэки Robokassa (без авторизации) ───────────────

  @ApiExcludeEndpoint()
  @SkipThrottle()
  @Post('result')
  resultPost(@Body() body: any, @Query() query: any) {
    return this.result({ ...query, ...body });
  }

  @ApiExcludeEndpoint()
  @SkipThrottle()
  @Get('result')
  resultGet(@Query() query: any) {
    return this.result(query);
  }

  private async result(p: any): Promise<string> {
    const outSum = String(p.OutSum ?? p.outSum ?? '');
    const invId  = String(p.InvId ?? p.invId ?? p.inv_id ?? '');
    const sign   = String(p.SignatureValue ?? p.signatureValue ?? '');
    const ok = await this.payment.handleResult(outSum, invId, sign);
    return ok ? `OK${invId}` : 'bad sign';
  }

  @ApiExcludeEndpoint()
  @Get('success')
  successGet(@Res() res: Response) {
    return res.redirect(this.payment.successRedirect());
  }

  @ApiExcludeEndpoint()
  @Post('success')
  successPost(@Res() res: Response) {
    return res.redirect(this.payment.successRedirect());
  }

  @ApiExcludeEndpoint()
  @Get('fail')
  failGet(@Res() res: Response) {
    return res.redirect(this.payment.failRedirect());
  }

  @ApiExcludeEndpoint()
  @Post('fail')
  failPost(@Res() res: Response) {
    return res.redirect(this.payment.failRedirect());
  }
}
