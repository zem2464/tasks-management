import { Injectable, Logger } from '@nestjs/common';
import { retry, CircuitBreaker, handleAll } from 'cockatiel';

@Injectable()
export class ResilienceService {
  private readonly logger = new Logger(ResilienceService.name);

  private readonly retryPolicy = retry(handleAll, { maxAttempts: 3, backoff: 'exponential' });
  private readonly circuitBreaker = new CircuitBreaker(handleAll, {
    halfOpenAfter: 10 * 1000, // 10 seconds
    breaker: {
      failureThreshold: 3,
      successThreshold: 2,
    },
  });

  async resilientCall<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.retryPolicy.execute(fn)).catch(err => {
      this.logger.error('Resilience failure', err);
      throw err;
    });
  }
}
