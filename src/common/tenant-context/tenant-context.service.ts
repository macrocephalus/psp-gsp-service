import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  // optional: store может открываться пустым (middleware), а наполняться позже (interceptor)
  brandId?: string;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  /**
   * Открыть пустой контекст на весь жизненный цикл запроса (middleware).
   * next() вызывается синхронно внутри run(), поэтому вся async-цепочка
   * запроса (guards → interceptors → handler) рождается под активным store.
   */
  runWithEmptyContext<T>(fn: () => T): T {
    return this.als.run({}, fn);
  }

  /** Явный контекст с brandId — для вебхуков, тестов, будущих очередей/CLI. */
  runWithBrand<T>(brandId: string, fn: () => T): T {
    return this.als.run({ brandId }, fn);
  }

  /**
   * Наполнить УЖЕ открытый контекст (interceptor после auth).
   * Мутирует существующий store, а не создаёт новый, поэтому ссылка на store
   * одна на весь запрос и хендлер видит значение.
   */
  setBrandId(brandId: string): void {
    const store = this.als.getStore();
    if (!store) {
      throw new InternalServerErrorException(
        'Tenant context store is not initialized (middleware missing?)',
      );
    }
    store.brandId = brandId;
  }

  getBrandId(): string {
    const store = this.als.getStore();
    if (!store?.brandId) {
      throw new InternalServerErrorException(
        'Tenant context is not set. Did you forget to run within tenant scope?',
      );
    }
    return store.brandId;
  }

  tryGetBrandId(): string | undefined {
    return this.als.getStore()?.brandId;
  }
}
