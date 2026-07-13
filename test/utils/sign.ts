import { createHmac } from 'node:crypto';

/**
 * Повторяет логику WebhookSignatureGuard: sha256=<hex(hmac(secret, brandId + '.' + rawBody))>.
 * brandId входит в подписанный материал, поэтому заголовок X-Brand-Id нельзя
 * подменить в перехваченном запросе (защита от cross-tenant replay).
 */
export function signBody(
  brandId: string,
  body: string,
  secret: string,
): string {
  return (
    'sha256=' +
    createHmac('sha256', secret)
      .update(`${brandId}.`)
      .update(body)
      .digest('hex')
  );
}
