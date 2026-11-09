import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // A record that does not exist, or a malformed id/date in the URL, is the
    // caller's mistake (404/400), not a server fault - say so plainly.
    const pgCode = exception instanceof QueryFailedError ? (exception as any).driverError?.code : undefined;
    const isNotFound = exception instanceof EntityNotFoundError;
    const isBadInput = pgCode === '22P02' || pgCode === '22007' || pgCode === '22008';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : isNotFound
          ? HttpStatus.NOT_FOUND
          : isBadInput
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : isNotFound
          ? 'That record was not found. It may have been deleted.'
          : isBadInput
            ? 'Part of the request is not in a valid format (for example an id or a date).'
            : 'An unexpected error occurred. This has been logged for review.';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
