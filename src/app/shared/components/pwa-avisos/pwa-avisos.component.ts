import { Component, inject } from '@angular/core';
import { PwaService } from '../../../core/services/pwa.service';

/** Avisos flotantes de la PWA: instalar, nueva versión y sin conexión. */
@Component({
  selector: 'app-pwa-avisos',
  standalone: true,
  template: `
    @if (pwa.sinConexion()) {
      <div class="pwa-aviso pwa-aviso--offline" role="status">
        📡 Sin conexión: estás viendo la última información guardada.
      </div>
    }
    @if (pwa.hayActualizacion()) {
      <div class="pwa-aviso" role="status">
        <span>✨ Hay una versión nueva de CineLanús.</span>
        <button type="button" (click)="pwa.actualizar()">Actualizar</button>
      </div>
    } @else if (pwa.puedeInstalar()) {
      <div class="pwa-aviso">
        <span>📲 Instalá CineLanús en tu dispositivo.</span>
        <button type="button" (click)="pwa.instalar()">Instalar</button>
      </div>
    }
  `,
  styles: [`
    :host { position: fixed; left: 50%; bottom: 1rem; transform: translateX(-50%); z-index: 1000;
            display: flex; flex-direction: column; gap: 0.5rem; width: min(440px, calc(100% - 2rem)); }
    .pwa-aviso { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
                 background: #1a1a1a; color: #eee; border: 1px solid #f5b301; border-radius: 12px;
                 padding: 0.75rem 1rem; font-size: 0.9rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .pwa-aviso--offline { border-color: #ef4444; justify-content: center; }
    button { background: #f5b301; color: #000; border: none; border-radius: 8px;
             padding: 0.45rem 0.9rem; font-weight: 700; cursor: pointer; flex-shrink: 0; }
  `]
})
export class PwaAvisosComponent {
  pwa = inject(PwaService);
}
