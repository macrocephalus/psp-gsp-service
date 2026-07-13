import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { RawEventSource } from '../entities/raw-event.entity';
import {
  IngestCallbackUseCase,
  IngestCommand,
} from './ingest-callback.use-case';

describe('IngestCallbackUseCase', () => {
  let useCase: IngestCallbackUseCase;
  let tenantContext: TenantContextService;

  // Мокаем только внешний мир: транзакционный entity manager.
  const managerMock = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    update: jest.fn(),
  };

  const dataSourceMock = {
    transaction: jest.fn((fn: (m: unknown) => unknown) =>
      Promise.resolve(fn(managerMock)),
    ),
  };

  function mockInsertReturning(rawRows: unknown[]) {
    managerMock.createQueryBuilder.mockReturnValue({
      insert: () => ({
        into: () => ({
          values: () => ({
            orIgnore: () => ({
              returning: () => ({
                execute: () => Promise.resolve({ raw: rawRows }),
              }),
            }),
          }),
        }),
      }),
    });
  }

  const command: IngestCommand = {
    source: RawEventSource.PSP,
    provider: 'stripe',
    externalEventId: 'evt_42',
    payload: { eventId: 'evt_42', type: 'deposit.succeeded', data: {} },
    headers: {},
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IngestCallbackUseCase,
        TenantContextService,
        { provide: DataSource, useValue: dataSourceMock },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    useCase = moduleRef.get(IngestCallbackUseCase);
    tenantContext = moduleRef.get(TenantContextService);
  });

  it('persists raw event and links key when callback is new', async () => {
    mockInsertReturning([{ id: 'key-1' }]); // вставлена 1 строка → мы первые
    managerMock.save.mockResolvedValue({ id: 'raw-1' });

    const result = await tenantContext.runWithBrand('brandA', () =>
      useCase.execute(command),
    );

    expect(result).toEqual({ outcome: 'accepted', rawEventId: 'raw-1' });
    expect(managerMock.save).toHaveBeenCalledTimes(1);
    expect(managerMock.update).toHaveBeenCalledTimes(1);
  });

  it('returns duplicate and persists nothing when key already exists', async () => {
    mockInsertReturning([]); // 0 строк → дубликат

    const result = await tenantContext.runWithBrand('brandA', () =>
      useCase.execute(command),
    );

    expect(result).toEqual({ outcome: 'duplicate' });
    expect(managerMock.save).not.toHaveBeenCalled();
    expect(managerMock.update).not.toHaveBeenCalled();
  });

  it('fails closed when tenant context is missing', async () => {
    await expect(useCase.execute(command)).rejects.toThrow(
      /Tenant context is not set/,
    );
  });
});
