import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { InternalController } from './internal.controller';
import { InternalGuard } from './internal.guard';

@Module({
  imports: [IngestModule],
  controllers: [InternalController],
  providers: [InternalGuard],
})
export class InternalModule {}
