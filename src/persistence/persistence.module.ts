import { Global, Module } from '@nestjs/common';
import { TenantScopedRepositoryFactory } from './tenant-scoped.repository';

@Global()
@Module({
  providers: [TenantScopedRepositoryFactory],
  exports: [TenantScopedRepositoryFactory],
})
export class PersistenceModule {}
