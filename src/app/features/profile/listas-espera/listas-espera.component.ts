import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ListaEsperaService, MiListaEspera, desdeUtc } from '../../../core/services/lista-espera.service';
import { desdeBD } from '../../../shared/utils/fechas';
import { ModalService } from '../../../core/services/modal.service';

/** Listas de espera del usuario: en cuáles está y en qué posición (mail "RPP final"). */
@Component({
  selector: 'app-listas-espera',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './listas-espera.component.html',
  styleUrl: '../perfil-seccion.css'
})
export class ListasEsperaComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private listaEspera = inject(ListaEsperaService);
  private router = inject(Router);
  private modalService = inject(ModalService);

  listas = signal<MiListaEspera[]>([]);
  cargando = signal<boolean>(true);
  private ahora = signal<number>(Date.now());
  private reloj: ReturnType<typeof setInterval> | null = null;

  activas = computed(() => this.listas().filter(l => l.estado === 'esperando' || l.estado === 'notificado'));
  historial = computed(() => this.listas().filter(l => l.estado !== 'esperando' && l.estado !== 'notificado'));

  readonly ETIQUETAS: Record<string, string> = {
    esperando: 'En espera', notificado: '¡Tu turno!', compro: 'Compraste',
    vencido: 'Turno vencido', salio: 'Saliste', cancelada: 'Función cancelada'
  };

  async ngOnInit(): Promise<void> {
    // Primero se procesan las listas: vencen turnos viejos y se avisa a quien corresponda
    await this.listaEspera.procesar();
    await this.cargar();
    this.reloj = setInterval(() => {
      this.ahora.set(Date.now());
      if (this.activas().some(l => l.estado === 'notificado' && this.segundos(l) === 0)) this.cargar();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  private async cargar(): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) { this.cargando.set(false); return; }
    try {
      this.listas.set(await this.listaEspera.misListas(user.id));
    } finally {
      this.cargando.set(false);
    }
  }

  fecha(l: MiListaEspera): Date | null { return desdeBD(l.funcion.fecha_hora); }

  segundos(l: MiListaEspera): number {
    return l.vence_en ? Math.max(0, Math.floor((desdeUtc(l.vence_en).getTime() - this.ahora()) / 1000)) : 0;
  }

  textoReloj(l: MiListaEspera): string {
    const s = this.segundos(l);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  comprar(l: MiListaEspera): void {
    this.router.navigate(['/sala', l.funcion.id], {
      queryParams: { horario: l.funcion.fecha_hora, sala: l.funcion.sala_id }
    });
  }

  async salir(l: MiListaEspera): Promise<void> {
    if (!(await this.modalService.confirmar('Salir de la lista de espera', '¿Salir de esta lista de espera? Vas a perder tu lugar.', 'Salir'))) return;
    await this.listaEspera.salir(l.id);
    await this.listaEspera.procesar(l.funcion.id);
    await this.cargar();
  }
}
