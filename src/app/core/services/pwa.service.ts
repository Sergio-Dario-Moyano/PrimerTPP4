import { Service, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** Evento no estándar que Chrome/Edge disparan cuando la app se puede instalar. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Funciones PWA visibles para el usuario:
 *  - instalar la app (botón propio en lugar del aviso del navegador)
 *  - avisar cuando hay una versión nueva desplegada
 *  - indicar cuando no hay conexión
 */
@Service()
export class PwaService {
  private swUpdate = inject(SwUpdate);
  private eventoInstalacion: BeforeInstallPromptEvent | null = null;

  puedeInstalar = signal<boolean>(false);
  hayActualizacion = signal<boolean>(false);
  sinConexion = signal<boolean>(!navigator.onLine);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.eventoInstalacion = e as BeforeInstallPromptEvent;
      this.puedeInstalar.set(true);
    });
    window.addEventListener('appinstalled', () => this.puedeInstalar.set(false));
    window.addEventListener('online', () => this.sinConexion.set(false));
    window.addEventListener('offline', () => this.sinConexion.set(true));

    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.hayActualizacion.set(true));
    }
  }

  async instalar(): Promise<void> {
    if (!this.eventoInstalacion) return;
    await this.eventoInstalacion.prompt();
    await this.eventoInstalacion.userChoice;
    this.eventoInstalacion = null;
    this.puedeInstalar.set(false);
  }

  actualizar(): void {
    document.location.reload();
  }
}
