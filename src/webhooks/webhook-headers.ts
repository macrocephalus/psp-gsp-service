/**
 * Заголовки, которые сохраняются в raw_events.headers вместе с payload.
 * Только идентификация доставки и контента; секретные заголовки
 * (x-signature, authorization, cookie) в allowlist не входят — сырое
 * событие читают будущие процессы (ledger processor, ручной разбор
 * инцидентов), им подпись не нужна, а её утечка дала бы готовую пару
 * (body, signature) для replay исходного запроса.
 */
const PERSISTED_HEADER_ALLOWLIST = [
  'x-brand-id',
  'content-type',
  'user-agent',
  'x-correlation-id',
] as const;

export function pickPersistedHeaders(
  headers: Record<string, unknown>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const name of PERSISTED_HEADER_ALLOWLIST) {
    if (headers[name] !== undefined) {
      picked[name] = headers[name];
    }
  }
  return picked;
}
