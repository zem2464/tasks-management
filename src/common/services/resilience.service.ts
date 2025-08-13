import { Injectable, Logger } from '@nestjs/common';
import { retry, circuitBreaker, handleAll, ExponentialBackoff, ConsecutiveBreaker } from 'cockatiel';

@Injectable()
export class ResilienceService {
  private readonly logger = new Logger(ResilienceService.name);

  private readonly retryPolicy = retry(handleAll, { maxAttempts: 3, backoff: new ExponentialBackoff() });
  private readonly circuitBreaker = circuitBreaker(handleAll, {
    halfOpenAfter: 10 * 1000, // 10 seconds
    breaker: new ConsecutiveBreaker(3), // Opens after 3 consecutive failures
  });

  async resilientCall<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.retryPolicy.execute(fn)).catch((err: any) => {
      this.logger.error('Resilience failure', err);
      throw err;
    });
  }
}
