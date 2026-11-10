import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { aTimestampBD, desdeBD } from '../../shared/utils/fechas';

export interface FilaDia {
  fecha: string;          // aaaa-mm-dd
  compras: number;
  entradas: number;
  facturacion: number;    // dinero cobrado (sin crédito usado)
}

export interface ItemRanking { nombre: string; cantidad: number; }

export interface DatosReporte {
  porDia: FilaDia[];
  totalFacturado: number;
  totalEntradas: number;
  totalCompras: number;
  creditoUsado: number;
  candy: ItemRanking[];
}

interface CompraFila {
  fecha_compra: string;
  total_pagado: number;
  credito_usado: number | null;
  entradas: { estado: string }[];
  detalle_candy: {
    cantidad: number;
    estado: string;
    combos_candy: { nombre: string } | null;
    productos_candy: { nombre: string } | null;
  }[];
}

const clave = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Reportes del admin (mails 28/02 y 10/03). Todo se calcula sobre compras no canceladas. */
@Service()
export class ReporteService {
  private supabase = inject(SupabaseService).client;

  /** Facturación y entradas por día + candy más vendido en [desde, hasta]. */
  async getReporte(desde: Date, hasta: Date): Promise<DatosReporte> {
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);

    const { data, error } = await this.supabase
      .from('compras')
      .select(`
        fecha_compra, total_pagado, credito_usado,
        entradas ( estado ),
        detalle_candy ( cantidad, estado, combos_candy ( nombre ), productos_candy ( nombre ) )
      `)
      .eq('estado', 'completada')
      // fecha_compra está guardada en UTC: filtramos con el rango convertido a UTC
      .gte('fecha_compra', desde.toISOString())
      .lte('fecha_compra', fin.toISOString());
    if (error) throw error;

    // Un registro por cada día del período, aunque no haya ventas
    const dias = new Map<string, FilaDia>();
    for (const d = new Date(desde); d <= fin; d.setDate(d.getDate() + 1)) {
      dias.set(clave(d), { fecha: clave(d), compras: 0, entradas: 0, facturacion: 0 });
    }

    const candy = new Map<string, number>();
    let creditoUsado = 0;

    for (const c of (data ?? []) as unknown as CompraFila[]) {
      // fecha_compra se guarda en UTC (toISOString) → la pasamos a hora local
      const fecha = new Date(c.fecha_compra.endsWith('Z') || c.fecha_compra.includes('+') ? c.fecha_compra : `${c.fecha_compra}Z`);
      const fila = dias.get(clave(fecha));
      if (!fila) continue;
      fila.compras++;
      fila.entradas += c.entradas.filter(e => e.estado !== 'cancelada').length;
      fila.facturacion += Number(c.total_pagado);
      creditoUsado += Number(c.credito_usado ?? 0);

      for (const item of c.detalle_candy) {
        if (item.estado === 'cancelado') continue;
        const nombre = item.combos_candy?.nombre ?? item.productos_candy?.nombre ?? 'Otro';
        candy.set(nombre, (candy.get(nombre) ?? 0) + item.cantidad);
      }
    }

    const porDia = [...dias.values()];
    return {
      porDia,
      totalFacturado: porDia.reduce((a, d) => a + d.facturacion, 0),
      totalEntradas: porDia.reduce((a, d) => a + d.entradas, 0),
      totalCompras: porDia.reduce((a, d) => a + d.compras, 0),
      creditoUsado,
      candy: [...candy.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad)
    };
  }

  /** Películas más vistas: entradas no canceladas cuya FUNCIÓN cae en [desde, hasta]. */
  async getPeliculasMasVistas(desde: Date, hasta: Date): Promise<ItemRanking[]> {
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);

    const { data, error } = await this.supabase
      .from('entradas')
      .select('estado, funciones!inner ( fecha_hora, peliculas ( titulo ) )')
      .neq('estado', 'cancelada')
      .gte('funciones.fecha_hora', aTimestampBD(desde))
      .lte('funciones.fecha_hora', aTimestampBD(fin));
    if (error) throw error;

    const conteo = new Map<string, number>();
    type Fila = { funciones: { fecha_hora: string; peliculas: { titulo: string } | null } | null };
    for (const e of (data ?? []) as unknown as Fila[]) {
      if (!e.funciones || !desdeBD(e.funciones.fecha_hora)) continue;
      const titulo = e.funciones.peliculas?.titulo ?? 'Sin título';
      conteo.set(titulo, (conteo.get(titulo) ?? 0) + 1);
    }
    return [...conteo.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  }
}
