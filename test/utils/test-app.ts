import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

/**
 * Поднимает Nest-приложение так же, как это делает main.ts, но для тестов.
 *
 * Две вещи НЕ переносятся автоматически из main.ts в тестовое приложение и
 * должны быть заново применены здесь:
 *  - rawBody: true  → guard проверки подписи вебхука читает request.rawBody.
 *    Без этого каждый подписанный вебхук возвращает 401.
 *  - глобальный ValidationPipe → app.useGlobalPipes() живёт только в main.ts.
 *
 * Глобальный exception filter и tenant interceptor ПЕРЕНОСЯТСЯ, потому что они
 * зарегистрированы через токены APP_FILTER / APP_INTERCEPTOR внутри AppModule.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({
    rawBody: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

export async function truncateAll(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  // страховка: e2e должен очищать только изолированную базу *_test,
  // созданную global-setup, и никогда dev/prod-базу из .env
  const dbName = String(ds.options.database);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to truncate non-test database "${dbName}" — did global-setup run?`,
    );
  }
  await ds.query(
    'TRUNCATE TABLE idempotency_keys, raw_events, sessions, users CASCADE',
  );
}
