import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule],
  controllers: [ServersController, SyncController],
  providers: [ServersService, SyncService],
  exports: [ServersService],
})
export class ServersModule {}
