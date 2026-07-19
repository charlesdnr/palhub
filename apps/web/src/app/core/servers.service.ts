import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiKeyDto,
  LiveSnapshot,
  PalboxSnapshot,
  PublicServerDto,
  ServerDto,
  SyncConfigDto,
} from '@palhub/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ServersService {
  private readonly http = inject(HttpClient);

  // --- espace admin (cookie de session) ---

  listMine(): Promise<ServerDto[]> {
    return firstValueFrom(this.http.get<ServerDto[]>('/api/servers'));
  }

  getMine(id: string): Promise<ServerDto> {
    return firstValueFrom(this.http.get<ServerDto>(`/api/servers/${id}`));
  }

  create(input: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<ServerDto> {
    return firstValueFrom(this.http.post<ServerDto>('/api/servers', input));
  }

  update(id: string, input: Partial<ServerDto>): Promise<ServerDto> {
    return firstValueFrom(
      this.http.patch<ServerDto>(`/api/servers/${id}`, input),
    );
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/servers/${id}`));
  }

  rotateApiKey(id: string): Promise<ApiKeyDto> {
    return firstValueFrom(
      this.http.post<ApiKeyDto>(`/api/servers/${id}/api-key`, {}),
    );
  }

  // --- synchro hébergée ---

  getSyncConfig(id: string): Promise<SyncConfigDto | null> {
    return firstValueFrom(
      this.http.get<SyncConfigDto | null>(`/api/servers/${id}/sync`),
    );
  }

  putSyncConfig(
    id: string,
    input: {
      host: string;
      port: number;
      username: string;
      authType: 'password' | 'key';
      secret?: string;
      remotePath: string;
      enabled: boolean;
    },
  ): Promise<SyncConfigDto> {
    return firstValueFrom(
      this.http.put<SyncConfigDto>(`/api/servers/${id}/sync`, input),
    );
  }

  deleteSyncConfig(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/servers/${id}/sync`));
  }

  // --- lecture publique ---

  listPublic(): Promise<PublicServerDto[]> {
    return firstValueFrom(this.http.get<PublicServerDto[]>('/api/public/servers'));
  }

  getPublic(slug: string): Promise<PublicServerDto> {
    return firstValueFrom(
      this.http.get<PublicServerDto>(`/api/public/s/${slug}`),
    );
  }

  getLive(slug: string): Promise<LiveSnapshot | null> {
    return firstValueFrom(
      this.http.get<LiveSnapshot>(`/api/public/s/${slug}/live`),
    ).catch(() => null);
  }

  getPalbox(slug: string): Promise<PalboxSnapshot | null> {
    return firstValueFrom(
      this.http.get<PalboxSnapshot>(`/api/public/s/${slug}/palbox`),
    ).catch(() => null);
  }
}
