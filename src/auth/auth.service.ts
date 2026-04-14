import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterDto } from './DTO/register.dto';
import * as argon2 from 'argon2'
import { loginRequest } from './DTO/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { Response } from 'express';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import * as jwt from 'jsonwebtoken';



@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaDatabaseService,
        private readonly jwtsService: JwtService,
        private readonly configService: ConfigService
    ){}

    async register(dto: RegisterDto, res: Response){
        const existUser = await this.prisma.user.findFirst({
        where: {
            OR: [
            { email: dto.email },
            { username: dto.username }
            ]
        }
        });
        if(existUser){
            throw new ConflictException("Пользователь с таким email или username цже существует")
        }
        const passwordHash = await argon2.hash(dto.passwordHash, {
            type: argon2.argon2id,
            memoryCost: 19458,
            timeCost: 2,
            parallelism: 1
        });
        const user = await this.prisma.user.create({
            data:{
                username: dto.username,
                email: dto.email,
                passwordHash: passwordHash
            },
            select:{
                id: true,
                username: true,
                email: true
            }
        });
        return await this.generateToken(user, res);
    };

    async login(dto: loginRequest, res: Response){
        const user = await this.prisma.user.findUnique({
            where:{
                username: dto.username
            },
            select:{
                id: true,
                email: true,
                username: true,
                passwordHash: true
            }
        });
        if(!user){
            throw new UnauthorizedException("неверный логин или пароль")
        }
        const isValidPassword = await argon2.verify(user.passwordHash, dto.passwordHash);
        if (!user || !isValidPassword) {
            throw new UnauthorizedException("Неверный логин или пароль");
        }
        const {passwordHash, ...safeUser} = user;
        return await this.generateToken(safeUser, res);
    }

    async refresh(res: Response){
        const refreshToken = res.req.cookies['refresh_token'];
        if(!refreshToken){
            throw new UnauthorizedException("Refresh token отсутствует");
        }
        try{
            const payload = jwt.verify(refreshToken, this.configService.getOrThrow('JWT_REFRESH_SECRET')) as {sub: string};
            const user = await this.prisma.user.findUnique({
                where:{
                    id: payload.sub
                },
                select:{
                    id: true,
                    email: true,
                    username: true
                }
            });
            if(!user){
                throw new UnauthorizedException("Пользователь не найден");
            }
            const newAccessToken = await this.jwtsService.signAsync({
                sub: user.id,
                email: user.email,
                username: user.username
            },{
                secret: this.configService.get('JWT_ACCESS_SECRET'),
                expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
            }
        );
        res.cookie('access_token', newAccessToken, {
            httpOnly: true,
            secure: this.configService.get('NODE_ENV') === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 15 * 60 * 1000,
        });
        return {accessToken: newAccessToken}
        } catch(err){
            throw new UnauthorizedException("Неверный или истекший refresh token");
        }
    }

    async generateToken(user: {id: string, email: string, username: string | null}, res: Response){
        const payload = {
            sub: user.id,
            email: user.email,
            username: user.username
        };
        const accessToken = await this.jwtsService.signAsync(payload, {
            secret: this.configService.get('JWT_ACCESS_SECRET'),
            expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION')
        });
        const refreshToken = {sub: user.id};
        const refresh_Token = await this.jwtsService.signAsync(refreshToken, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION')
        });
        res.cookie('refresh_token', refresh_Token, {
            httpOnly: true,
            secure: this.configService.get('NODE_ENV') === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.cookie('access_token', accessToken, {
            httpOnly: true,
            secure: this.configService.get('NODE_ENV') === 'production',
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        });
        return {accessToken: accessToken };
    }
}
