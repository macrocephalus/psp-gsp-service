import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../src/common/tenant-context/tenant-context.service';
import { RawEvent } from '../src/webhooks/entities/raw-event.entity';
import { TenantScopedRepositoryFactory } from '../src/persistence/tenant-scoped.repository';
import { createTestApp, truncateAll } from './utils/test-app';

interface MeBody {
  userId: string;
  brandId: string;
  email: string;
}

describe('Tenant isolation (e2e)', () => {
  let app: INestApplication<App>;

  const registerAndLogin = async (brandId: string, email: string) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ brandId, email, password: 'secret123' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ brandId, email, password: 'secret123' })
      .expect(200);
    return (login.body as { accessToken: string }).accessToken;
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => truncateAll(app));
  afterAll(() => app.close());

  it('same email registers independently in two brands', async () => {
    const tokenA = await registerAndLogin('brandA', 'user@mail.com');
    const tokenB = await registerAndLogin('brandB', 'user@mail.com');

    const meA = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const meB = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const bodyA = meA.body as MeBody;
    const bodyB = meB.body as MeBody;
    expect(bodyA.brandId).toBe('brandA');
    expect(bodyB.brandId).toBe('brandB');
    expect(bodyA.userId).not.toBe(bodyB.userId);
  });

  it('login credentials of brandA do not work against brandB', async () => {
    await registerAndLogin('brandA', 'only-a@mail.com');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        brandId: 'brandB',
        email: 'only-a@mail.com',
        password: 'secret123',
      })
      .expect(401);
  });

  it('tenant-scoped repository cannot read another brand data', async () => {
    // Прямой тест механизма Stage-5 в обход HTTP.
    const ds = app.get(DataSource);
    await ds.query(`
      INSERT INTO raw_events (source, provider, brand_id, external_event_id, payload, headers)
      VALUES ('psp', 'stripe', 'brandB', 'evt_secret', '{}', '{}')
    `);

    const ctx = app.get(TenantContextService);
    const factory = app.get(TenantScopedRepositoryFactory);
    const repo = factory.for(RawEvent);

    const fromA = await ctx.runWithBrand('brandA', () =>
      repo.findOneScoped({ externalEventId: 'evt_secret' }),
    );
    const fromB = await ctx.runWithBrand('brandB', () =>
      repo.findOneScoped({ externalEventId: 'evt_secret' }),
    );

    expect(fromA).toBeNull(); // brandA его не видит
    expect(fromB).not.toBeNull(); // владелец видит
  });
});
