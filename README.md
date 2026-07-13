# psp-gsp-service

Multi-tenant ingestion service for PSP (payment service provider) and GSP (game
service provider) webhook callbacks. It authenticates operators per brand,
verifies webhook signatures, and stores incoming callbacks **exactly once** even
under concurrent retries.

Built with NestJS 11, TypeORM 0.3 and PostgreSQL 16.

## Core capabilities

- **Per-brand identity** — register/login scoped by `brandId`; the same email can
  exist independently in different brands.
- **Stateless JWT auth backed by server-side sessions** — tokens can be revoked
  and expire; every request is validated against a live session.
- **Signed webhook ingestion** — HMAC-SHA256 signature over the raw request body,
  compared in constant time.
- **Idempotent, concurrency-safe ingestion** — a unique constraint plus
  `INSERT ... ON CONFLICT DO NOTHING ... RETURNING` inside a transaction
  guarantees exactly one stored event per `(source:provider, brand, eventId)`.
- **Strict tenant isolation** — a request-scoped tenant context (AsyncLocalStorage)
  fails closed when no brand is set, and scoped reads never cross brands.
- **Operational hygiene** — structured logging with correlation ids, a global
  error envelope, request throttling, and environment validation on boot.

See [DECISIONS.md](./DECISIONS.md) for the reasoning behind these choices and
[API.md](./API.md) for the endpoint reference.

## Requirements coverage

| Requirement | Where |
| --- | --- |
| Callbacks saved to `raw_events` | `IngestCallbackUseCase` — full provider payload + headers, `status`/`processed_at` as outbox hooks |
| Idempotency for repeated callbacks | `idempotency_keys` UNIQUE + `INSERT … ON CONFLICT DO NOTHING` in one transaction; e2e covers concurrent retries |
| Tenant isolation (`brandId`) | ALS tenant context (fail-closed) + HMAC binds `X-Brand-Id` to the signature; e2e leakage suite |
| No direct balance updates | Webhook adapters only persist; there is no balance/ledger write path at all — a future ledger consumer reads `raw_events` |
| Structured errors | Global filter → `{ statusCode, code, message, correlationId }` |
| Tests (unit / idempotency / leakage) | `src/**/*.spec.ts`, `test/webhooks-idempotency.e2e-spec.ts`, `test/tenant-isolation.e2e-spec.ts` |
| Correlation id in logs | pino `genReqId` + `X-Correlation-Id` response header, id echoed in error bodies |
| OpenAPI (nice-to-have) | Swagger UI at `/docs`, JSON at `/docs-json` |
| Contract test for payload (nice-to-have) | in `webhooks-idempotency.e2e-spec.ts` — extra fields accepted & persisted, missing `eventId` → 400 |

## Prerequisites

- Node.js 20+
- Docker (for the PostgreSQL container)

## Setup

```bash
npm install
cp .env.example .env      # adjust secrets as needed
npm run setup             # starts PostgreSQL (docker compose, host port 5433) and applies migrations
```

`npm run setup` is idempotent — it waits for the database healthcheck and
re-running it is safe.

## Running

```bash
npm run start:dev         # watch mode, http://localhost:3000
npm run start:prod        # from a prior `npm run build`
```

Quick smoke test of the webhook path:

```bash
./scripts/send-webhook.sh psp stripe brandA evt_001
```

## Docs

- Swagger UI: http://localhost:3000/docs (interactive, use **Authorize** to paste a JWT)
- OpenAPI JSON: http://localhost:3000/docs-json (importable into Postman/Insomnia)

The spec is generated from the code via the `@nestjs/swagger` CLI plugin, so it
stays in sync with the actual controllers and DTOs.

## Testing

Unit tests need no database. Integration and e2e tests only need the
docker-compose PostgreSQL to be running — a jest global setup automatically
creates and migrates an isolated `<DB_NAME>_test` database, so your dev data
is never touched.

```bash
npm run test              # unit tests
npm run test:e2e          # integration + e2e (only `docker compose up -d` required)
npm run test:cov          # unit coverage
npm run lint              # eslint (also used as the pre-submit gate)
npm run typecheck         # tsc --noEmit over src + test
```

The e2e suite runs with a single worker and truncates tables between tests
(with a safety check that refuses to truncate any database whose name does not
end in `_test`). See DECISIONS.md for the trade-off vs. Testcontainers.

## Project layout

```
src/
  common/
    filters/            global error envelope
    tenant-context/     AsyncLocalStorage tenant scope + interceptor
  config/               env validation, TypeORM data source
  identity/             register/login/refresh, JWT strategy, session entity
  users/                users table owner: entity, UsersService, response DTO
  persistence/          migrations, tenant-scoped repository factory
  webhooks/             signature guard, controllers, ingestion use-case, entities
test/
  utils/                test-app bootstrap + signing helper
  *.e2e-spec.ts         integration + isolation suites
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | HTTP port (default 3000) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | PostgreSQL connection |
| `JWT_SECRET` | JWT signing secret (min 16 chars) |
| `JWT_TTL` | Access token lifetime (e.g. `900s`) |
| `SESSION_MAX_LIFETIME` | Absolute session ceiling for `/auth/refresh` (default `24h`) |
| `PSP_WEBHOOK_SECRET` | HMAC secret for `/webhooks/psp/*` |
| `GSP_WEBHOOK_SECRET` | HMAC secret for `/webhooks/gsp/*` |

Boot fails fast if any required variable is missing or invalid.
