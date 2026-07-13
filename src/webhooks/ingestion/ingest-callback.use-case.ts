import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { IdempotencyKey } from '../entities/idempotency-key.entity';
import { RawEvent, RawEventSource } from '../entities/raw-event.entity';

export interface IngestCommand {
  source: RawEventSource;
  provider: string;
  externalEventId: string;
  payload: Record<string, unknown>;
  headers: Record<string, unknown>;
}

export type IngestResult =
  { outcome: 'accepted'; rawEventId: string } | { outcome: 'duplicate' };

@Injectable()
export class IngestCallbackUseCase {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(IngestCallbackUseCase.name);
  }

  async execute(cmd: IngestCommand): Promise<IngestResult> {
    const brandId = this.tenantContext.getBrandId();
    const scope = `${cmd.source}:${cmd.provider}`;

    return this.dataSource.transaction(async (manager) => {
      // 1) Атомарная попытка застолбить ключ. Арбитр — unique constraint.
      const insertResult = await manager
        .createQueryBuilder(IdempotencyKey, 'ik') // ← сущность + алиас
        .insert()
        .into(IdempotencyKey)
        .values({ scope, brandId, key: cmd.externalEventId })
        .orIgnore() // → INSERT ... ON CONFLICT DO NOTHING
        .returning(['id']) // RETURNING id → возвращает строку ТОЛЬКО если реально вставили
        .execute();

      const insertedKeys = (insertResult.raw ?? []) as Array<{ id: string }>;
      if (insertedKeys.length === 0) {
        // ключ уже существовал → дубликат
        this.logger.info(
          { scope, externalEventId: cmd.externalEventId },
          'Duplicate callback ignored',
        );
        return { outcome: 'duplicate' };
      }

      // 2) Мы первые → сохраняем сырое событие
      const rawEvent = await manager.save(
        manager.create(RawEvent, {
          source: cmd.source,
          provider: cmd.provider,
          brandId,
          externalEventId: cmd.externalEventId,
          payload: cmd.payload,
          headers: cmd.headers,
        }),
      );

      // 3) Связываем ключ с событием (аудит-трейл) — по id из RETURNING
      await manager.update(IdempotencyKey, insertedKeys[0].id, {
        rawEventId: rawEvent.id,
      });

      this.logger.info(
        {
          scope,
          externalEventId: cmd.externalEventId,
          rawEventId: rawEvent.id,
        },
        'Callback accepted and persisted',
      );
      return { outcome: 'accepted', rawEventId: rawEvent.id };
    });
  }
}
