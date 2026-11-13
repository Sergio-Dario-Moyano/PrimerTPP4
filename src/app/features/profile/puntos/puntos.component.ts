import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
import { FidelizacionService, Recompensa, SaldoFidelizacion } from '../../../core/services/fidelizacion.service';

/** Puntos, crédito a favor, entradas gratis y catálogo de canjes. */
@Component({
  selector: 'app-puntos',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  templateUrl: './puntos.component.html',
  styleUrls: ['./puntos.component.css']
})
export class PuntosComponent implements OnInit {
  private auth = inject(AuthService);
  private fidelizacion = inject(FidelizacionService);
  private modal = inject(ModalService);
  private router = inject(Router);

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);
  saldo = signal<SaldoFidelizacion>({ puntos: 0, credito: 0, entradasGratis: 0 });
  recompensas = signal<Recompensa[]>([]);
  canjeando = signal<string | null>(null);
  /** Pesos que vale cada punto al pagar en el checkout. */
  valorPunto = signal(1);

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) { this.error.set('Iniciá sesión para ver tus puntos.'); this.cargando.set(false); return; }
    try {
      const [saldo, recompensas, valorPunto] = await Promise.all([
        this.fidelizacion.getSaldo(user.id), this.fidelizacion.getRecompensas(),
        this.fidelizacion.getConfig('valor_punto_pesos', 1)
      ]);
      this.saldo.set(saldo);
      this.valorPunto.set(valorPunto);
      this.recompensas.set(recompensas);
    } catch (err) {
      console.error(err);
      this.error.set('No pudimos cargar tus puntos. Intentá de nuevo más tarde.');
    } finally {
      this.cargando.set(false);
    }
  }

  claveDe(r: Recompensa): string { return `${r.tipo}:${r.id ?? 'entrada'}`; }

  async canjear(r: Recompensa): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) return;
    if (!(await this.modal.confirmar('Confirmar canje', `¿Canjear ${r.costo} puntos por "${r.nombre}"?`, 'Canjear'))) return;

    this.canjeando.set(this.claveDe(r));
    try {
      const compraId = await this.fidelizacion.canjear(user.id, r);
      await this.cargar();
      if (compraId) {
        this.modal.open('¡Canje realizado!', `Retirá "${r.nombre}" en el Candy Bar mostrando el QR de este ticket.`, 'success');
        this.router.navigate(['/ticket', compraId]);
      } else {
        this.modal.open('¡Canje realizado!', 'Sumaste 1 entrada gratis. La podés usar en el checkout de tu próxima compra.', 'success');
      }
    } catch (err) {
      this.modal.open('No se pudo canjear', err instanceof Error ? err.message : 'Error al canjear.', 'error');
    } finally {
      this.canjeando.set(null);
    }
  }
}
