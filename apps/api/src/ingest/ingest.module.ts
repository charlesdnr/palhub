import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  controllers: [IngestController],
  providers: [IngestService, ApiKeyGuard],
  exports: [IngestService],
})
export class IngestModule {}
