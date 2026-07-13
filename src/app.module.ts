import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  EnvironmentVariables,
  NodeEnv,
  validateEnv,
} from './config/env.validation';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IdentityModule } from './identity/identity.module';
import { TenantContextModule } from './common/tenant-context/tenant-context.module';
import { TenantContextInterceptor } from './common/tenant-context/tenant-context.interceptor';
import { TenantContextMiddleware } from './common/tenant-context/tenant-context.middleware';
import { PersistenceModule } from './persistence/persistence.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level:
            config.get('NODE_ENV', { infer: true }) === NodeEnv.Production
              ? 'info'
              : 'debug',

          // ключевое место: откуда берётся id запроса
          genReqId: (req, res) => {
            const incoming = req.headers['x-correlation-id'];
            const id =
              typeof incoming === 'string' && incoming.length > 0
                ? incoming
                : randomUUID();
            res.setHeader('X-Correlation-Id', id);
            return id;
          },

          // не логируем лишнее и чувствительное
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
            ],
            censor: '[REDACTED]',
          },

          transport:
            config.get('NODE_ENV', { infer: true }) !== NodeEnv.Production
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,

          // немного тишины: не дублировать весь req/res в каждой строке
          autoLogging: true,
          customProps: () => ({}),
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        type: 'postgres',
        host: config.get('DB_HOST', { infer: true }),
        port: config.get('DB_PORT', { infer: true }),
        username: config.get('DB_USER', { infer: true }),
        password: config.get('DB_PASSWORD', { infer: true }),
        database: config.get('DB_NAME', { infer: true }),
        autoLoadEntities: true,
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: false,
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TenantContextModule,
    PersistenceModule,
    IdentityModule,
    WebhooksModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
