import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { PublicServerDto } from '@palhub/shared';
import { ServersService } from '../../core/servers.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomePage {
  private readonly servers = inject(ServersService);
  protected readonly listed = signal<PublicServerDto[] | undefined>(undefined);

  constructor() {
    void this.servers.listPublic().then(
      (s) => this.listed.set(s),
      () => this.listed.set([]),
    );
  }
}
