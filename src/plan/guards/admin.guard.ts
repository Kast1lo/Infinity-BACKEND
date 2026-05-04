import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaDatabaseService } from '../../prisma-database/prisma-database.service';
import { ADMIN_EMAILS } from '../plan.constants';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaDatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req    = context.switchToHttp().getRequest();
    const userId = req.user?.userId;

    if (!userId) throw new ForbiddenException('Нет доступа');

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true },
    });

    if (!user || !ADMIN_EMAILS.includes(user.email)) {
      throw new ForbiddenException('Нет доступа');
    }

    return true;
  }
}
