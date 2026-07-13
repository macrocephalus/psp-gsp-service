import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  DB_PORT: number = 5432;

  @IsString()
  DB_USER: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET: string;

  // формат ограничен, потому что из этого же значения вычисляется TTL сессии (jwtTtlToMs)
  @IsString()
  @Matches(/^\d+(s|m|h|d)?$/, {
    message: 'JWT_TTL must look like 900s, 15m, 1h or 7d',
  })
  JWT_TTL: string = '900s';

  // абсолютный потолок жизни сессии: refresh продлевает expires_at,
  // но не дальше created_at + SESSION_MAX_LIFETIME
  @IsString()
  @Matches(/^\d+(s|m|h|d)?$/, {
    message: 'SESSION_MAX_LIFETIME must look like 900s, 15m, 1h or 7d',
  })
  SESSION_MAX_LIFETIME: string = '24h';

  @IsString()
  PSP_WEBHOOK_SECRET: string;

  @IsString()
  GSP_WEBHOOK_SECRET: string;
}

const TTL_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** ' миллисекунды; сессия живёт столько же, сколько JWT. */
export function jwtTtlToMs(ttl: string): number {
  const match = /^(\d+)(s|m|h|d)?$/.exec(ttl);
  if (!match) {
    throw new Error(`Unsupported JWT_TTL format: ${ttl}`);
  }
  return Number(match[1]) * TTL_UNIT_MS[match[2] ?? 's'];
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validated;
}
