import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { RawEventSource } from './entities/raw-event.entity';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';
import { IngestCallbackUseCase } from './ingestion/ingest-callback.use-case';
import { pickPersistedHeaders } from './webhook-headers';

@ApiTags('webhooks/gsp')
@Controller('webhooks/gsp')
@SkipThrottle()
@UseGuards(WebhookSignatureGuard)
export class GspWebhookController {
  constructor(
    private readonly ingest: IngestCallbackUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Brand-Id',
    required: true,
    description: 'Tenant (brand) identifier',
  })
  @ApiHeader({
    name: 'X-Signature',
    required: true,
    description: 'sha256=<HMAC-SHA256 hex of the raw request body>',
  })
  @ApiOkResponse({
    description:
      'Returned for BOTH first delivery ({outcome:"accepted"}) and retries ({outcome:"duplicate"}). Duplicates return 200 on purpose — a non-2xx would trigger endless provider retries.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid signature / brand; nothing persisted.',
  })
  async handle(
    @Param('provider') provider: string,
    @Body() body: WebhookPayloadDto,
    @Req()
    req: {
      verifiedBrandId: string;
      headers: Record<string, unknown>;
      body: Record<string, unknown>;
    },
  ) {
    return this.tenantContext.runWithBrand(req.verifiedBrandId, () =>
      this.ingest.execute({
        source: RawEventSource.GSP,
        provider,
        externalEventId: body.eventId,
        // req.body — оригинальный распарсенный JSON: whitelist-pipe срезает
        // неизвестные поля только из DTO, а сохраняем мы полный payload провайдера
        payload: req.body,
        headers: pickPersistedHeaders(req.headers),
      }),
    );
  }
}
