import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';
import { FidelizacionService } from '../../../../core/services/fidelizacion.service';

interface ProductoPuntos { id: string; nombre: string; costo_puntos: number; activo: boolean; }

/**
 * Configuración del programa de puntos (mail 03/03): cuántos puntos cuesta
 * cada recompensa. También el recargo de las butacas VIP (mail 10/03).
 */
@Component({
  selector: 'app-admin-fidelizacion',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './admin-fidelizacion.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminFidelizacionComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private log = inject(LogService);
  private fidelizacion = inject(FidelizacionService);

  puntosEntrada = signal<number>(500);
  recargoVip = signal<number>(50);
  productos = signal<ProductoPuntos[]>([]);
  canjesTotales = signal<number>(0);
  puntosCanjeados = signal<number>(0);

  mensajeExito = signal('');
  mensajeError = signal('');

  private valoresOriginales = { puntosEntrada: 500, recargoVip: 50 };
  private puntosOriginales = new Map<string, number>();

  async ngOnInit(): Promise<void> {
    const [entrada, vip, prods, canjes] = await Promise.all([
      this.fidelizacion.getConfig('puntos_canje_entrada', 500),
      this.fidelizacion.getConfig('recargo_vip_porcentaje', 50),
      this.supabase.from('productos_candy').select('id, nombre, costo_puntos, activo').order('nombre'),
      this.supabase.from('canjes').select('puntos')
    ]);
    this.puntosEntrada.set(entrada);
    this.recargoVip.set(vip);
    this.valoresOriginales = { puntosEntrada: entrada, recargoVip: vip };
    this.productos.set(prods.data ?? []);
    this.puntosOriginales = new Map((prods.data ?? []).map(p => [p.id, p.costo_puntos]));
    this.canjesTotales.set(canjes.data?.length ?? 0);
    this.puntosCanjeados.set((canjes.data ?? []).reduce((acc, c) => acc + c.puntos, 0));
  }

  actualizarCostoProducto(id: string, valor: number): void {
    this.productos.update(lista => lista.map(p => p.id === id ? { ...p, costo_puntos: Number(valor) } : p));
  }

  async guardar(): Promise<void> {
    this.mensajeExito.set('');
    this.mensajeError.set('');

    if (this.puntosEntrada() < 1 || this.recargoVip() < 0 || this.productos().some(p => p.costo_puntos < 0)) {
      this.mensajeError.set('Los valores no pueden ser negativos.');
      return;
    }

    try {
      if (this.puntosEntrada() !== this.valoresOriginales.puntosEntrada) {
        await this.fidelizacion.setConfig('puntos_canje_entrada', this.puntosEntrada());
        await this.log.registrar('MODIFICAR_PRECIO', 'configuracion', null,
          `Puntos para canjear una entrada: ${this.valoresOriginales.puntosEntrada} → ${this.puntosEntrada()}`);
      }
      if (this.recargoVip() !== this.valoresOriginales.recargoVip) {
        await this.fidelizacion.setConfig('recargo_vip_porcentaje', this.recargoVip());
        await this.log.registrar('MODIFICAR_PRECIO', 'configuracion', null,
          `Recargo de butacas VIP: ${this.valoresOriginales.recargoVip}% → ${this.recargoVip()}%`);
      }
      for (const p of this.productos()) {
        const antes = this.puntosOriginales.get(p.id) ?? 0;
        if (antes !== p.costo_puntos) {
          await this.supabase.from('productos_candy').update({ costo_puntos: p.costo_puntos }).eq('id', p.id);
          await this.log.registrar('MODIFICAR_PRECIO', 'productos_candy', p.id,
            `Costo en puntos de "${p.nombre}": ${antes} → ${p.costo_puntos}`);
          this.puntosOriginales.set(p.id, p.costo_puntos);
        }
      }
      this.valoresOriginales = { puntosEntrada: this.puntosEntrada(), recargoVip: this.recargoVip() };
      this.mensajeExito.set('Configuración guardada.');
    } catch (err) {
      this.mensajeError.set(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }
}
