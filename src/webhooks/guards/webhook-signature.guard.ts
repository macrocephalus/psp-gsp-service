import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EnvironmentVariables } from '../../config/env.validation';
import { RawEventSource } from '../entities/raw-event.entity';

// тот же алфавит/лимит, что и в RegisterDto/LoginDto и varchar(64) в схеме:
// более длинное или с другими символами значение упало бы на INSERT как 500 вместо 4xx
const TENANT_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

interface WebhookRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  rawBody?: Buffer;
  verifiedBrandId?: string;
}

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<WebhookRequest>();

    // psp или gsp — определяем из пути
    const source: RawEventSource = request.path.includes('/webhooks/psp/')
      ? RawEventSource.PSP
      : RawEventSource.GSP;

    const secret =
      source === RawEventSource.PSP
        ? this.config.get('PSP_WEBHOOK_SECRET', { infer: true })
        : this.config.get('GSP_WEBHOOK_SECRET', { infer: true });

    const signatureHeader = request.headers['x-signature'];
    const brandId = request.headers['x-brand-id'];
    const provider = request.params?.provider;
    const rawBody: Buffer | undefined = request.rawBody;

    if (typeof provider !== 'string' || !TENANT_KEY_RE.test(provider)) {
      throw new BadRequestException('Invalid provider');
    }
    if (
      typeof signatureHeader !== 'string' ||
      !signatureHeader.startsWith('sha256=')
    ) {
      throw new UnauthorizedException('Missing or malformed signature');
    }
    if (typeof brandId !== 'string' || !TENANT_KEY_RE.test(brandId)) {
      throw new UnauthorizedException('Missing or invalid X-Brand-Id header');
    }
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Empty body');
    }

    // brandId входит в подписанный материал: замена X-Brand-Id в перехваченном
    // запросе инвалидирует подпись — cross-tenant replay невозможен без секрета
    const expected = createHmac('sha256', secret)
      .update(`${brandId}.`)
      .update(rawBody)
      .digest('hex');
    const provided = signatureHeader.slice('sha256='.length);

    // сравниваем буферы одинаковой длины за constant-time
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('Invalid signature');
    }

    // подпись валидна → фиксируем проверенный бренд для контроллера
    request.verifiedBrandId = brandId;
    return true;
  }
}
