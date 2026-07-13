import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { EnvironmentVariables, jwtTtlToMs } from '../config/env.validation';
import { UserDto } from '../users/dto/user.dto';
import { UsersService } from '../users/users.service';
import { Session } from './entities/session.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string; // userId — стандартное название claim'а "субъект"
  brandId: string;
  sessionId: string;
}

@Injectable()
export class AuthService {
  // сессия и JWT живут одинаково долго — оба берутся из JWT_TTL,
  // иначе токен, валидный по подписи, молча умирал бы на проверке сессии
  private readonly sessionTtlMs: number;

  // абсолютный потолок: refresh продлевает сессию, но не дальше
  // created_at + maxLifetime — украденный токен нельзя обновлять вечно
  private readonly sessionMaxLifetimeMs: number;

  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly jwtService: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.sessionTtlMs = jwtTtlToMs(config.get('JWT_TTL', { infer: true }));
    this.sessionMaxLifetimeMs = jwtTtlToMs(
      config.get('SESSION_MAX_LIFETIME', { infer: true }),
    );
  }

  async register(dto: RegisterDto): Promise<UserDto> {
    // хеширование — забота auth (это credential-логика),
    // инварианты таблицы users (нормализация, уникальность) — забота UsersService
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.usersService.createUser({
      brandId: dto.brandId,
      email: dto.email,
      passwordHash,
    });
    return UserDto.from(user);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.usersService.findByBrandAndEmail(
      dto.brandId,
      dto.email,
    );

    // намеренно одинаковый ответ для "нет пользователя" и "неверный пароль"
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        brandId: user.brandId,
        expiresAt: new Date(Date.now() + this.sessionTtlMs),
      }),
    );

    const payload: JwtPayload = {
      sub: user.id,
      brandId: user.brandId,
      sessionId: session.id,
    };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }

  async refresh(payload: JwtPayload): Promise<{ accessToken: string }> {
    const session = await this.sessions.findOne({
      where: { id: payload.sessionId, brandId: payload.brandId },
    });

    // guard уже проверил живость сессии, но между guard'ом и этим кодом
    // сессию могли отозвать — перечитываем, а не доверяем payload'у
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const absoluteDeadlineMs =
      session.createdAt.getTime() + this.sessionMaxLifetimeMs;
    const remainingMs = absoluteDeadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw new UnauthorizedException(
        'Session max lifetime exceeded, log in again',
      );
    }

    // продление обрезается по потолку, и JWT подписывается на тот же срок —
    // иначе получили бы токен, валидный по подписи, но мёртвый по сессии
    const ttlMs = Math.min(this.sessionTtlMs, remainingMs);
    session.expiresAt = new Date(Date.now() + ttlMs);
    await this.sessions.save(session);

    const newPayload: JwtPayload = {
      sub: payload.sub,
      brandId: payload.brandId,
      sessionId: session.id,
    };
    return {
      accessToken: await this.jwtService.signAsync(newPayload, {
        expiresIn: Math.floor(ttlMs / 1000),
      }),
    };
  }

  async validateSession(payload: JwtPayload): Promise<boolean> {
    const session = await this.sessions.findOne({
      where: { id: payload.sessionId, brandId: payload.brandId },
    });
    return (
      !!session && session.revokedAt === null && session.expiresAt > new Date()
    );
  }
}
