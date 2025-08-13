import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorResponse: any = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || message;
        errorResponse = res;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log error with stack for server errors, warn for client errors
    if (status >= 500) {
      this.logger.error(`HTTP ${status} Error: ${message}`, exception.stack);
    } else {
      this.logger.warn(`HTTP ${status} Error: ${message}`);
    }

    // Consistent error response, avoid leaking stack traces
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errorResponse.errors ? { errors: errorResponse.errors } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}