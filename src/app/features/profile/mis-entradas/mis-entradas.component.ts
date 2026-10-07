import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';

// Interfaz estricta para el historial de compras
export interface CompraHistorial {
  id: string;
  fecha_compra: string;
  total_pagado: number;
  estado: string;
  codigo_manual?: string;
  codigo_ticket: string;
  codigo_mostrar: string;
}

@Component({
  selector: 'app-mis-entradas',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './mis-entradas.component.html',
  styleUrls: ['./mis-entradas.component.css']
})
export class MisEntradasComponent implements OnInit {
  private supabaseService = inject(SupabaseService);

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);
  historialCompras = signal<CompraHistorial[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const supabase = this.supabaseService.client;
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) throw new Error('Usuario no autenticado');

      const { data: comprasData, error: comprasError } = await supabase
        .from('compras')
        .select(`
          id,
          fecha_compra,
          total_pagado,
          estado,
          codigo_manual,
          codigo_ticket
        `)
        .eq('perfil_id', authData.user.id)
        .order('fecha_compra', { ascending: false });

      if (comprasError) throw comprasError;

      // Mapeo con tipado estricto
      const comprasFormateadas: CompraHistorial[] = (comprasData || []).map(compra => ({
        id: compra.id,
        fecha_compra: compra.fecha_compra,
        total_pagado: Number(compra.total_pagado),
        estado: compra.estado,
        codigo_manual: compra.codigo_manual,
        codigo_ticket: compra.codigo_ticket,
        codigo_mostrar: compra.codigo_manual ? compra.codigo_manual : compra.id.substring(0, 8).toUpperCase()
      }));

      this.historialCompras.set(comprasFormateadas);

    } catch (err) {
      // Tipado seguro del error
      const msg = err instanceof Error ? err.message : 'Error desconocido al cargar las entradas';
      this.error.set(msg);
    } finally {
      this.cargando.set(false);
    }
  }
}
