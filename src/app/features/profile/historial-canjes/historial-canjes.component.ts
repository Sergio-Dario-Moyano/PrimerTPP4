import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { FidelizacionService, CanjeHistorial } from '../../../core/services/fidelizacion.service';

/** Historial de canjes de puntos (mail 03/03). */
@Component({
  selector: 'app-historial-canjes',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './historial-canjes.component.html',
  styleUrls: ['./historial-canjes.component.css'],
})
export class HistorialCanjesComponent implements OnInit {
  private auth = inject(AuthService);
  private fidelizacion = inject(FidelizacionService);

  cargandoHistorial = signal<boolean>(true);
  error = signal<string | null>(null);
  canjes = signal<CanjeHistorial[]>([]);

  async ngOnInit(): Promise<void> {
    const user = this.auth.usuarioActual();
    try {
      if (!user) throw new Error('Usuario no autenticado');
      this.canjes.set(await this.fidelizacion.getHistorial(user.id));
    } catch (err) {
      console.error(err);
      this.error.set(err instanceof Error ? err.message : 'Error al obtener el historial de canjes');
    } finally {
      this.cargandoHistorial.set(false);
    }
  }
}
