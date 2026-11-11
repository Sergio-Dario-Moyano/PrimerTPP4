import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';

export type EstadoEspera = 'esperando' | 'notificado' | 'compro' | 'vencido' | 'salio' | 'cancelada';

export interface MiLugarEnEspera {
  id: string;
  estado: EstadoEspera;
  vence_en: string | null;
  posicion: number;
}

export interface EstadoEsperaFuncion {
  /** Avisados con turno vigente (sus butacas están reservadas por 15 minutos). */
  reservadas: number;
  /** Personas anotadas (esperando + avisados). */
  enEspera: number;
  /** Mi lugar en la lista, si estoy anotado. */
  miLugar: MiLugarEnEspera | null;
}

export interface MiListaEspera extends MiLugarEnEspera {
  creado_en: string;
  funcion: {
    id: string;
    fecha_hora: string;
    sala_id: number;
    estado: string;
    peliculas: { titulo: string; url_imagen: string } | null;
    salas: { nombre: string } | null;
  };
}

const ACTIVOS: EstadoEspera[] = ['esperando', 'notificado'];

/** "Fecha UTC sin zona" de la BD (now()) → Date. */
export const desdeUtc = (valor: string): Date => new Date(valor.endsWith('Z') ? valor : `${valor}Z`);

/**
 * Lista de espera para funciones agotadas (mail "RPP final").
 * El orden es por fecha de inscripción. Cuando se libera una butaca, la función
 * SQL procesar_listas_espera avisa al primero y le reserva 15 minutos.
 */
@Service()
export class ListaEsperaService {
  private supabase = inject(SupabaseService).client;

  /** Vence turnos pasados de 15 min y avisa a los siguientes. */
  async procesar(funcionId?: string): Promise<void> {
    const { error } = await this.supabase.rpc('procesar_listas_espera', funcionId ? { p_funcion: funcionId } : {});
    if (error) console.error('Error procesando listas de espera:', error);
  }

  async estadoFuncion(funcionId: string, userId: string | null): Promise<EstadoEsperaFuncion> {
    const { data } = await this.supabase
      .from('lista_espera')
      .select('id, perfil_id, estado, vence_en, creado_en')
      .eq('funcion_id', funcionId)
      .in('estado', ACTIVOS)
      .order('creado_en');

    const filas = data ?? [];
    const ahora = Date.now();
    const vigentes = filas.filter(f => f.estado === 'esperando' || (f.vence_en && desdeUtc(f.vence_en).getTime() > ahora));
    const mia = userId ? vigentes.find(f => f.perfil_id === userId) : undefined;

    return {
      reservadas: vigentes.filter(f => f.estado === 'notificado' && f.perfil_id !== userId).length,
      enEspera: vigentes.length,
      miLugar: mia ? {
        id: mia.id,
        estado: mia.estado as EstadoEspera,
        vence_en: mia.vence_en,
        posicion: vigentes.filter(f => f.estado === 'esperando' && f.creado_en <= mia.creado_en).length
      } : null
    };
  }

  async anotarme(funcionId: string, userId: string): Promise<void> {
    const { error } = await this.supabase.from('lista_espera').insert({ funcion_id: funcionId, perfil_id: userId });
    if (error) {
      throw new Error(error.code === '23505' ? 'Ya estás anotado en esta lista.' : error.message);
    }
  }

  async salir(id: string): Promise<void> {
    await this.supabase.from('lista_espera').update({ estado: 'salio' }).eq('id', id);
  }

  /** Al comprar, la persona deja la lista (y su reserva se libera para el siguiente). */
  async marcarCompra(funcionId: string, userId: string): Promise<void> {
    await this.supabase.from('lista_espera').update({ estado: 'compro' })
      .eq('funcion_id', funcionId).eq('perfil_id', userId).in('estado', ACTIVOS);
  }

  /** Listas del usuario, con posición calculada. */
  async misListas(userId: string): Promise<MiListaEspera[]> {
    const { data, error } = await this.supabase
      .from('lista_espera')
      .select(`id, estado, vence_en, creado_en, funcion_id,
               funcion:funciones ( id, fecha_hora, sala_id, estado, peliculas ( titulo, url_imagen ), salas ( nombre ) )`)
      .eq('perfil_id', userId)
      .order('creado_en', { ascending: false })
      .limit(30);
    if (error) throw error;

    const filas = (data ?? []) as unknown as (Omit<MiListaEspera, 'posicion'> & { funcion_id: string })[];
    const activas = filas.filter(f => f.estado === 'esperando');

    // Posición: cuántos "esperando" de esa función se anotaron antes (o al mismo tiempo)
    const posiciones = new Map<string, number>();
    await Promise.all(activas.map(async f => {
      const { count } = await this.supabase
        .from('lista_espera')
        .select('id', { count: 'exact', head: true })
        .eq('funcion_id', f.funcion_id)
        .eq('estado', 'esperando')
        .lte('creado_en', f.creado_en);
      posiciones.set(f.id, count ?? 0);
    }));

    return filas.map(f => ({ ...f, posicion: posiciones.get(f.id) ?? 0 }));
  }

  /** Cantidad de personas en espera por función (para el admin). */
  async conteoPorFuncion(funcionIds: string[]): Promise<Map<string, number>> {
    const conteo = new Map<string, number>();
    if (!funcionIds.length) return conteo;
    const { data } = await this.supabase
      .from('lista_espera').select('funcion_id').in('funcion_id', funcionIds).in('estado', ACTIVOS);
    for (const f of data ?? []) conteo.set(f.funcion_id, (conteo.get(f.funcion_id) ?? 0) + 1);
    return conteo;
  }
}
