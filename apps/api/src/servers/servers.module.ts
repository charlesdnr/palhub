import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule],
  controllers: [ServersController, SyncController, InvitesController],
  providers: [ServersService, SyncService, InvitesService],
  exports: [ServersService],
})
export class ServersModule {}
