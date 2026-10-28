import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';
import { HealthResponse } from '@magazzino/shared';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly title = signal('Magazzino');
  protected readonly health = signal<'verifica…' | 'ok' | 'errore'>('verifica…');

  constructor() {
    this.http.get('/api/health').subscribe({
      next: (body) => {
        const result = HealthResponse.safeParse(body);
        this.health.set(result.success && result.data.db ? 'ok' : 'errore');
      },
      error: () => this.health.set('errore'),
    });
  }
}
