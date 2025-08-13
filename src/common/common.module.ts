import { Module, Global } from '@nestjs/common';
import { DistributedCacheService } from './services/distributed-cache.service';
import { ResilienceService } from './services/resilience.service';

@Global()
@Module({
  providers: [DistributedCacheService, ResilienceService],
  exports: [DistributedCacheService, ResilienceService],
})
export class CommonModule {}
