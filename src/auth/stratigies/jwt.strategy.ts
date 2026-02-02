import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: (req: Request & { cookies?: Record<string, string> }) => {
        return req?.cookies?.['access_token'] || null;
      },
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {

    if (!payload || !payload.sub) {
      return null;
    }

    const user = {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
    };
    return user;
  }
}