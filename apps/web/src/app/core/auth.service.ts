import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { UserDto } from '@palhub/shared';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /** undefined = pas encore vérifié, null = non connecté */
  readonly user = signal<UserDto | null | undefined>(undefined);

  /** Vérifie la session au démarrage (cookie httpOnly côté API). */
  async refresh(): Promise<UserDto | null> {
    try {
      const user = await firstValueFrom(this.http.get<UserDto>('/api/auth/me'));
      this.user.set(user);
      return user;
    } catch {
      this.user.set(null);
      return null;
    }
  }

  async ensureLoaded(): Promise<UserDto | null> {
    const current = this.user();
    if (current !== undefined) {
      return current;
    }
    return this.refresh();
  }

  login(): void {
    // Redirection plein écran : le flux OAuth revient sur /me/servers.
    window.location.href = '/api/auth/discord';
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.user.set(null);
  }
}
