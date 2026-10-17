import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';

@Service()
export class ReporteService {
  private supabase = inject(SupabaseService).client;

  async getDatosReporteFacturacion() {
    // Obtenemos las compras completadas con sus entradas y detalles de candy
    const { data: compras, error } = await this.supabase
      .from('compras')
      .select(`
        id,
        total_pagado,
        fecha_compra,
        estado,
        entradas ( id, precio_cobrado ),
        detalle_candy ( cantidad, combos_candy ( nombre ) )
      `)
      .eq('estado', 'completada');

    if (error) throw error;
    return compras || [];
  }

  async getPeliculasMasVistas() {
    const { data, error } = await this.supabase
      .from('peliculas')
      .select('titulo, entradas_vendidas')
      .order('entradas_vendidas', { ascending: false })
      .limit(5);

    if (error) throw error;
    return data || [];
  }

  async getCandyMasVendido() {
    const { data, error } = await this.supabase
      .from('detalle_candy')
      .select(`
        cantidad,
        combos_candy ( nombre )
      `);

    if (error) throw error;

    // Agrupamos la cantidad vendida por combo
    const conteo: Record<string, number> = {};
    for (const item of (data || [])) {
      const nombreCombo = (item.combos_candy as any)?.nombre || 'Desconocido';
      conteo[nombreCombo] = (conteo[nombreCombo] || 0) + item.cantidad;
    }

    return Object.entries(conteo)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }
}
