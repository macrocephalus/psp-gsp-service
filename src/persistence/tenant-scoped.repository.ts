import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
} from 'typeorm';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

export interface TenantOwned extends ObjectLiteral {
  brandId: string;
}

/**
 * Единственное место, где brandId из ALS-контекста подмешивается в чтение.
 * Используется сервисами-владельцами таблиц (UsersService) для запросов
 * "в рамках текущего тенанта". Набор методов сознательно минимальный:
 * новые (findScoped-список, createScoped) добавляются вместе с первым
 * реальным потребителем, не впрок.
 */
@Injectable()
export class TenantScopedRepositoryFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  for<T extends TenantOwned>(entity: EntityTarget<T>) {
    const repo = this.dataSource.getRepository(entity);
    const ctx = this.tenantContext;

    return {
      findOneScoped(where: FindOptionsWhere<T>): Promise<T | null> {
        return repo.findOne({
          where: { ...where, brandId: ctx.getBrandId() },
        });
      },
    };
  }
}
