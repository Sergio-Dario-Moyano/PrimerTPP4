import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase';

export interface CanjeItem {
  id: string;
  fecha_compra: string;
  total_pagado: number;
  cupon: {
    codigo: string;
    porcentaje_descuento: number;
  } | null;
}

@Component({
  selector: 'app-historial-canjes',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './historial-canjes.component.html',
  styleUrls: ['./historial-canjes.component.css'],
})
export class HistorialCanjesComponent implements OnInit {
  private supabaseService = inject(SupabaseService);

  cargandoHistorial = signal<boolean>(true);
  error = signal<string | null>(null);
  canjes = signal<CanjeItem[]>([]);

  ngOnInit() {
    this.obtenerHistorialCanjes();
  }

  async obtenerHistorialCanjes() {
    this.cargandoHistorial.set(true);
    const supabase = this.supabaseService.client;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const usuarioActivo = authData?.user;

      if (authError || !usuarioActivo) {
        throw new Error('Usuario no autenticado');
      }

      const { data, error: fetchError } = await supabase
        .from('compras')
        .select(`
          id,
          fecha_compra,
          total_pagado,
          cupones (
            codigo,
            porcentaje_descuento
          )
        `)
        .eq('perfil_id', usuarioActivo.id)
        .not('cupon_id', 'is', null)
        .order('fecha_compra', { ascending: false });

      if (fetchError) throw fetchError;

      // Mapeo seguro evitando usar 'any'
      const canjesMapeados: CanjeItem[] = (data || []).map((item: any) => {
        // Supabase puede devolver la relación como objeto o array según la foreign key
        const cuponRelacion = Array.isArray(item.cupones) ? item.cupones[0] : item.cupones;

        return {
          id: item.id,
          fecha_compra: item.fecha_compra,
          total_pagado: Number(item.total_pagado),
          cupon: cuponRelacion ? {
            codigo: cuponRelacion.codigo,
            porcentaje_descuento: Number(cuponRelacion.porcentaje_descuento)
          } : null
        };
      });

      this.canjes.set(canjesMapeados);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al obtener el historial de canjes';
      this.error.set(msg);
      console.error('Error:', err);
      this.canjes.set([]);
    } finally {
      this.cargandoHistorial.set(false);
    }
  }
}
