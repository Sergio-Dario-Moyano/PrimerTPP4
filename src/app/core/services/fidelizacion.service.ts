import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';

export interface Recompensa {
  tipo: 'entrada' | 'producto';
  id: string | null;
  nombre: string;
  imagen: string | null;
  costo: number;
}

export interface CanjeHistorial {
  id: string;
  tipo: 'entrada' | 'producto';
  puntos: number;
  descripcion: string;
  fecha: string;
  compra_id: string | null;
  compras: { codigo_ticket: string } | null;
}

export interface SaldoFidelizacion {
  puntos: number;
  credito: number;
  entradasGratis: number;
}

/**
 * Programa de fidelización (mail 03/03): 1 punto por peso gastado,
 * canje por entradas gratis o productos del candy con costos configurables.
 * Los puntos no se transfieren: todo opera sobre el perfil del usuario logueado.
 */
@Service()
export class FidelizacionService {
  private supabase = inject(SupabaseService).client;

  async getConfig(clave: string, porDefecto: number): Promise<number> {
    const { data } = await this.supabase.from('configuracion').select('valor').eq('clave', clave).maybeSingle();
    return data ? Number(data.valor) : porDefecto;
  }

  async setConfig(clave: string, valor: number): Promise<void> {
    const { error } = await this.supabase.from('configuracion').upsert({ clave, valor });
    if (error) throw error;
  }

  async getSaldo(perfilId: string): Promise<SaldoFidelizacion> {
    const { data, error } = await this.supabase
      .from('perfiles').select('puntos_fidelizacion, credito_favor, entradas_gratis').eq('id', perfilId).single();
    if (error) throw error;
    return {
      puntos: data.puntos_fidelizacion ?? 0,
      credito: Number(data.credito_favor ?? 0),
      entradasGratis: data.entradas_gratis ?? 0
    };
  }

  async getRecompensas(): Promise<Recompensa[]> {
    const costoEntrada = await this.getConfig('puntos_canje_entrada', 500);
    const { data } = await this.supabase
      .from('productos_candy').select('id, nombre, url_imagen, costo_puntos')
      .eq('activo', true).gt('costo_puntos', 0).order('costo_puntos');

    return [
      { tipo: 'entrada', id: null, nombre: 'Entrada general gratis', imagen: null, costo: costoEntrada },
      ...(data ?? []).map(p => ({ tipo: 'producto' as const, id: p.id, nombre: p.nombre, imagen: p.url_imagen, costo: p.costo_puntos }))
    ];
  }

  /**
   * Canjea una recompensa. Devuelve el id de la compra generada (solo para productos:
   * se retiran en el candy con el QR de esa compra, igual que una compra normal).
   */
  async canjear(perfilId: string, recompensa: Recompensa): Promise<string | null> {
    const saldo = await this.getSaldo(perfilId);
    if (saldo.puntos < recompensa.costo) {
      throw new Error(`Te faltan ${recompensa.costo - saldo.puntos} puntos para este canje.`);
    }

    let compraId: string | null = null;

    if (recompensa.tipo === 'producto') {
      const { data: auth } = await this.supabase.auth.getUser();
      const { data: compra, error } = await this.supabase.from('compras').insert({
        perfil_id: perfilId,
        total_pagado: 0,
        credito_usado: 0,
        puntos_usados: recompensa.costo,
        monto_puntos: 0,
        puntos_ganados: 0,
        metodo_pago: 'puntos',
        estado: 'completada',
        email_contacto: auth?.user?.email ?? ''
      }).select('id').single();
      if (error) throw error;
      compraId = compra.id;

      const { error: errCandy } = await this.supabase.from('detalle_candy').insert({
        compra_id: compraId, producto_id: recompensa.id, cantidad: 1, estado: 'pendiente'
      });
      if (errCandy) throw errCandy;
    }

    const { error: errPerfil } = await this.supabase.from('perfiles').update({
      puntos_fidelizacion: saldo.puntos - recompensa.costo,
      entradas_gratis: saldo.entradasGratis + (recompensa.tipo === 'entrada' ? 1 : 0)
    }).eq('id', perfilId);
    if (errPerfil) throw errPerfil;

    await this.supabase.from('canjes').insert({
      perfil_id: perfilId,
      tipo: recompensa.tipo,
      producto_id: recompensa.id,
      compra_id: compraId,
      puntos: recompensa.costo,
      descripcion: recompensa.nombre
    });

    return compraId;
  }

  async getHistorial(perfilId: string): Promise<CanjeHistorial[]> {
    const { data, error } = await this.supabase
      .from('canjes')
      .select('id, tipo, puntos, descripcion, fecha, compra_id, compras ( codigo_ticket )')
      .eq('perfil_id', perfilId)
      .order('fecha', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as CanjeHistorial[];
  }
}
