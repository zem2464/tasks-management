import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { rateLimiter } from '../config/rate-limit.config';

export const RATE_LIMIT_KEY = 'rate_limit_config';
export const RateLimit = (limit: number, windowMs: number) => SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    const handler = context.getHandler();
    const controller = context.getClass();
    const config =
      this.reflector.get(RATE_LIMIT_KEY, handler) ||
      this.reflector.get(RATE_LIMIT_KEY, controller) ||
      { limit: 100, windowMs: 60 * 1000 };
    const points = config.limit;
    const duration = Math.floor(config.windowMs / 1000);
    try {
      await rateLimiter.consume(ip, 1, { points, duration });
      return true;
    } catch (rejRes) {
      throw new HttpException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Rate limit exceeded',
        message: `Too many requests. Please try again later.`,
        limit: points,
        remaining: 0,
        nextValidRequestTime: new Date(Date.now() + ((rejRes as any).msBeforeNext || 0)).toISOString(),
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}