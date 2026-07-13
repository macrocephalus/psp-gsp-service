import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { EnvironmentVariables } from '../src/config/env.validation';
import { signBody } from './utils/sign';
import { createTestApp, truncateAll } from './utils/test-app';

interface OutcomeBody {
  outcome: 'accepted' | 'duplicate';
  rawEventId?: string;
}

describe('Webhook idempotency (e2e)', () => {
  let app: INestApplication<App>;
  let secret: string;

  const body = JSON.stringify({
    eventId: 'evt_concurrent_1',
    type: 'deposit.succeeded',
    data: { amount: 100, currency: 'EUR' },
  });

  const send = () =>
    request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('Content-Type', 'application/json')
      .set('X-Brand-Id', 'brandA')
      .set('X-Signature', signBody('brandA', body, secret))
      .send(body);

  const countRows = async (sql: string): Promise<number> => {
    const ds = app.get(DataSource);
    const rows = await ds.query<Array<{ count: number }>>(sql);
    return rows[0].count;
  };

  beforeAll(async () => {
    app = await createTestApp();
    secret = app
      .get<ConfigService<EnvironmentVariables, true>>(ConfigService)
      .get('PSP_WEBHOOK_SECRET', { infer: true });
  });
  beforeEach(() => truncateAll(app));
  afterAll(() => app.close());

  it('accepts first callback, deduplicates sequential retry', async () => {
    const first = await send().expect(200);
    expect((first.body as OutcomeBody).outcome).toBe('accepted');

    const retry = await send().expect(200);
    expect((retry.body as OutcomeBody).outcome).toBe('duplicate');
  });

  it('deduplicates CONCURRENT duplicates: exactly one accepted', async () => {
    const responses = await Promise.all([
      send(),
      send(),
      send(),
      send(),
      send(),
    ]);

    const outcomes = responses.map((r) => (r.body as OutcomeBody).outcome);
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(outcomes.filter((o) => o === 'accepted')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'duplicate')).toHaveLength(4);

    // и ровно один след в базе данных
    const events = await countRows(
      `SELECT count(*)::int AS count FROM raw_events WHERE external_event_id = 'evt_concurrent_1'`,
    );
    const keys = await countRows(
      `SELECT count(*)::int AS count FROM idempotency_keys WHERE key = 'evt_concurrent_1'`,
    );
    expect(events).toBe(1);
    expect(keys).toBe(1);
  });

  it('same event id in another brand is NOT a duplicate', async () => {
    await send().expect(200);

    const otherBrand = await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('Content-Type', 'application/json')
      .set('X-Brand-Id', 'brandB')
      .set('X-Signature', signBody('brandB', body, secret))
      .send(body)
      .expect(200);

    expect((otherBrand.body as OutcomeBody).outcome).toBe('accepted');
  });

  it('rejects invalid signature and persists nothing', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('Content-Type', 'application/json')
      .set('X-Brand-Id', 'brandA')
      .set('X-Signature', 'sha256=' + '0'.repeat(64))
      .send(body)
      .expect(401);

    expect(
      await countRows('SELECT count(*)::int AS count FROM raw_events'),
    ).toBe(0);
  });

  it('rejects cross-brand replay: a captured brandA request cannot be re-sent as brandB', async () => {
    // валидная пара (body, signature) для brandA...
    await send().expect(200);

    // ...повторно отправленный с подменённым заголовком X-Brand-Id должен провалить проверку подписи
    await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('Content-Type', 'application/json')
      .set('X-Brand-Id', 'brandB')
      .set('X-Signature', signBody('brandA', body, secret))
      .send(body)
      .expect(401);

    expect(
      await countRows(
        `SELECT count(*)::int AS count FROM raw_events WHERE brand_id = 'brandB'`,
      ),
    ).toBe(0);
  });

  // контрактные тесты для схемы payload вебхука
  it('accepts extra top-level fields and persists the FULL provider payload', async () => {
    const extendedBody = JSON.stringify({
      eventId: 'evt_extended_1',
      type: 'deposit.succeeded',
      data: { amount: 100, currency: 'EUR' },
      timestamp: '2026-07-13T10:00:00Z', // поле вне контракта
    });

    const res = await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('Content-Type', 'application/json')
      .set('X-Brand-Id', 'brandA')
      .set('X-Signature', signBody('brandA', extendedBody, secret))
      .send(extendedBody)
      .expect(200);

    expect((res.body as OutcomeBody).outcome).toBe('accepted');

    const ds = app.get(DataSource);
    const rows = await ds.query<Array<{ payload: Record<string, unknown> }>>(
      `SELECT payload FROM raw_events WHERE external_event_id = 'evt_extended_1'`,
    );
    // лишнее поле не потеряно — сохранён полный payload провайдера
    expect(rows[0].payload.timestamp).toBe('2026-07-13T10:00:00Z');
  });

  it('rejects payload without eventId (400) and persists nothing', async () => {
    const invalidBody = JSON.stringify({
      type: 'deposit.succeeded',
      data: {},
    });

    await request(app.getHttpServer())
      .post('/webhooks/psp/stripe')
      .set('Content-Type', 'application/json')
      .set('X-Brand-Id', 'brandA')
      .set('X-Signature', signBody('brandA', invalidBody, secret))
      .send(invalidBody)
      .expect(400);

    expect(
      await countRows('SELECT count(*)::int AS count FROM raw_events'),
    ).toBe(0);
  });
});
