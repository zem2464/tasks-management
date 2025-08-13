import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { ResilienceService } from './resilience.service';

@Injectable()
export class DistributedCacheService {
  private readonly logger = new Logger(DistributedCacheService.name);
  private readonly redis: Redis;

  constructor(
    @Inject(forwardRef(() => ResilienceService))
    private readonly resilienceService: ResilienceService,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }

  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    await this.resilienceService.resilientCall(() =>
      this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    );
    this.logger.debug(`Cache set: ${key}`);
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.resilienceService.resilientCall(() => this.redis.get(key));
    if (!data) return null;
    return JSON.parse(data) as T;
  }

  async delete(key: string): Promise<void> {
    await this.resilienceService.resilientCall(() => this.redis.del(key));
    this.logger.debug(`Cache deleted: ${key}`);
  }

  async publishInvalidation(channel: string, key: string): Promise<void> {
    await this.resilienceService.resilientCall(() => this.redis.publish(channel, key));
    this.logger.debug(`Published cache invalidation for key: ${key} on channel: ${channel}`);
  }

  subscribeInvalidation(channel: string, onInvalidate: (key: string) => void): void {
    const sub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
    sub.subscribe(channel, () => {
      sub.on('message', (chan, key) => {
        if (chan === channel) {
          this.logger.debug(`Received cache invalidation for key: ${key} on channel: ${channel}`);
          onInvalidate(key);
        }
      });
    });
  }

  // JWT Blacklist
  async blacklistJwt(token: string, exp: number): Promise<void> {
    // Store the token in Redis with TTL until its expiration
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.resilienceService.resilientCall(() =>
        this.redis.set(`jwt:blacklist:${token}`, '1', 'EX', ttl)
      );
      this.logger.debug(`JWT blacklisted: ${token} for ${ttl}s`);
    }
  }

  async isJwtBlacklisted(token: string): Promise<boolean> {
    const result = await this.resilienceService.resilientCall(() =>
      this.redis.get(`jwt:blacklist:${token}`)
    );
    return !!result;
  }
}
