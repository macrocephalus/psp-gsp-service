import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { brandId?: string } }>();
    const brandId = request.user?.brandId;

    // Store уже открыт middleware-ом на весь запрос; наполняем его мутацией.
    // Без brandId (неаутентифицированные маршруты) — оставляем пустым.
    if (brandId) {
      this.tenantContext.setBrandId(brandId);
    }

    return next.handle();
  }
}
