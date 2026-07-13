import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { RawEvent } from './entities/raw-event.entity';
import { GspWebhookController } from './gsp-webhook.controller';
import { PspWebhookController } from './psp-webhook.controller';
import { IngestCallbackUseCase } from './ingestion/ingest-callback.use-case';
import { WebhookSignatureGuard } from './guards/webhook-signature.guard';

@Module({
  imports: [TypeOrmModule.forFeature([RawEvent, IdempotencyKey])],
  controllers: [PspWebhookController, GspWebhookController],
  providers: [IngestCallbackUseCase, WebhookSignatureGuard],
})
export class WebhooksModule {}
