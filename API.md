# API Reference

Base URL: `http://localhost:3000`

All error responses share one envelope produced by the global exception filter:

```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "Invalid credentials",
  "correlationId": "b05be02c-4531-496f-9189-aa164ff0fb1a"
}
```

`correlationId` is echoed in the `X-Correlation-Id` response header and can be
supplied by the client via the same request header.

---

## Identity

### POST /auth/register

Creates a user within a brand. Email is unique **per brand**, so the same email
may register under multiple brands.

Request:

```json
{ "brandId": "brandA", "email": "user@mail.com", "password": "secret123" }
```

- `brandId` — `^[a-zA-Z0-9_-]+$`, max 64
- `email` — valid email, max 320
- `password` — 8–128 chars

Responses:

- `201` → `{ "id": "uuid", "email": "user@mail.com", "brandId": "brandA" }`
- `409` `CONFLICT` — email already registered for this brand
- `400` `VALIDATION_ERROR` — invalid body
- `429` `RATE_LIMITED` — more than 10 requests/min

### POST /auth/login

Verifies credentials, opens a session, and returns a JWT. The response is
identical for “no such user” and “wrong password”.

Request:

```json
{ "brandId": "brandA", "email": "user@mail.com", "password": "secret123" }
```

Responses:

- `200` → `{ "accessToken": "<jwt>" }`
- `401` `UNAUTHORIZED` — invalid credentials
- `429` `RATE_LIMITED` — more than 5 requests/min

The JWT payload carries `sub` (userId), `brandId`, and `sessionId`.

### POST /auth/refresh

Extends the current session and returns a fresh JWT for it. Requires
`Authorization: Bearer <jwt>` with a token that is still valid (call it
before the 15-minute TTL runs out). No request body.

The session can be extended repeatedly, but never past
`SESSION_MAX_LIFETIME` (default 24h) from the original login; the new
token's TTL is clipped to that ceiling so a signature-valid token never
outlives its session. After the ceiling, log in again.

Responses:

- `200` → `{ "accessToken": "<jwt>" }`
- `401` `UNAUTHORIZED` — token expired/invalid, session revoked, or
  session max lifetime exceeded
- `429` `RATE_LIMITED` — more than 30 requests/min

### GET /profile/me

Returns the authenticated principal. Requires `Authorization: Bearer <jwt>`.
The token is validated against a live, non-revoked, non-expired session.

Responses:

- `200` → `{ "userId": "uuid", "brandId": "brandA", "email": "user@mail.com" }`
- `401` `UNAUTHORIZED` — missing/invalid token, or session expired/revoked
- `404` `NOT_FOUND` — the user no longer exists within the current brand scope

---

## Webhooks

Two source families share one contract:

- `POST /webhooks/psp/:provider` — signed with `PSP_WEBHOOK_SECRET`
- `POST /webhooks/gsp/:provider` — signed with `GSP_WEBHOOK_SECRET`

`:provider` — `^[a-zA-Z0-9_-]{1,64}$` (e.g. `stripe`). These routes are exempt
from rate limiting.

Required headers:

| Header | Description |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Brand-Id` | Target brand (`^[a-zA-Z0-9_-]{1,64}$`); also the tenant scope for storage |
| `X-Signature` | `sha256=<hex>` HMAC-SHA256 of `<brandId>.<raw body>` |

The signed material is the `X-Brand-Id` value, a literal dot, then the raw
request body. Binding the brand into the signature means a captured request
cannot be replayed against another brand by swapping the header.

Request body:

```json
{
  "eventId": "evt_001",
  "type": "deposit.succeeded",
  "data": { "amount": 100, "currency": "EUR" }
}
```

- `eventId` — 1–255 chars, the idempotency key
- `type` — max 64 chars
- `data` — object

Additional top-level fields are **accepted and persisted** as part of the raw
payload (providers evolve their schemas); only the three fields above are
validated.

Responses:

- `200` → `{ "outcome": "accepted", "rawEventId": "uuid" }` — first time this
  `eventId` is seen for the brand; the full raw payload is persisted.
- `200` → `{ "outcome": "duplicate" }` — the `eventId` was already ingested for
  this brand (including concurrent retries). Nothing is persisted again.
- `401` `UNAUTHORIZED` — missing/malformed signature, missing or invalid
  `X-Brand-Id`, empty body, or signature mismatch (including a brand/signature
  mismatch on replay). Nothing is persisted.
- `400` `VALIDATION_ERROR` — body fails validation of the required fields, or
  `:provider` is malformed.

### Idempotency and tenancy

Uniqueness is scoped to `(source:provider, brandId, eventId)`. The same
`eventId` sent to two different brands is accepted independently. Duplicate
detection holds even for many simultaneous identical callbacks — exactly one is
accepted, the rest return `duplicate`.

### Signing example

```bash
BRAND='brandA'
BODY='{"eventId":"evt_001","type":"deposit.succeeded","data":{"amount":100,"currency":"EUR"}}'
# the signature covers "<brandId>.<raw body>"
SIG=$(printf '%s' "$BRAND.$BODY" | openssl dgst -sha256 -hmac "psp_dev_secret" | awk '{print $2}')

curl -i -X POST http://localhost:3000/webhooks/psp/stripe \
  -H 'Content-Type: application/json' \
  -H "X-Brand-Id: $BRAND" \
  -H "X-Signature: sha256=$SIG" \
  -d "$BODY"
```

---

## Health

### GET /health

Liveness probe. Always `200` → `{ "status": "ok" }`. Unauthenticated.
