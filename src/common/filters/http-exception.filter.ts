import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ id?: string }>();
    const correlationId = request.id ?? 'unknown';

    let status: number;
    let code: string;
    let message: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else {
        const r = response as Record<string, unknown>;
        if (Array.isArray(r.message)) {
          message = (r.message as string[]).join('; ');
        } else if (typeof r.message === 'string') {
          message = r.message;
        } else {
          message = exception.message;
        }
      }
      code = this.codeFromStatus(status);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_ERROR';
      message = 'Internal server error';
    }

    if (status >= 500) {
      this.logger.error({ err: exception, correlationId }, message);
    } else {
      this.logger.warn({ correlationId, status, code }, message);
    }

    const body: ErrorBody = {
      statusCode: status,
      code,
      message,
      correlationId,
    };
    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private codeFromStatus(status: number): string {
    const map: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      429: 'RATE_LIMITED',
    };
    return map[status] ?? 'ERROR';
  }
}
