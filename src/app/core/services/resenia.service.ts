import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth.service';
import { Resena } from '../models/Resenia.model';
import { desdeBD } from '../../shared/utils/fechas';

export type EstadoResenaTipo = 'no_logueado' | 'ya_comentada' | 'no_vista' | 'en_curso' | 'puede_comentar';
export interface EstadoResena { puede: boolean; estado: EstadoResenaTipo; terminaEn?: Date; }

interface FilaEntradaResena {
  funciones: { fecha_hora: string; peliculas: { duracion_minutos: number } | null } | null;
}

/** Fin de una función: inicio + duración de la película (si falta la duración, 2 horas). */
export function finDeFuncion(fechaHora: string | null | undefined, duracionMin: number | null | undefined): Date | null {
  const inicio = desdeBD(fechaHora);
  return inicio ? new Date(inicio.getTime() + (Number(duracionMin) || 120) * 60000) : null;
}

/** Texto para mostrar cuando todavía no se puede reseñar. */
export function mensajeEstadoResena(e: EstadoResena): string {
  switch (e.estado) {
    case 'no_logueado': return 'Debes iniciar sesión para calificar esta película.';
    case 'ya_comentada': return 'Ya calificaste esta película.';
    case 'en_curso': {
      const hora = e.terminaEn ? e.terminaEn.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
      return `Vas a poder calificarla cuando termine la función${hora ? ` (a las ${hora})` : ''}.`;
    }
    case 'no_vista': return 'Debes asistir a una función de esta película para poder reseñarla.';
    default: return '';
  }
}

@Service()
export class ReseniaService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  async getResenasPorPelicula(peliculaId: string): Promise<Resena[]> {
    const { data, error } = await this.supabase
      .from('resenas')
      .select(`
        *,
        perfiles (nombre, apellido)
      `)
      .eq('pelicula_id', peliculaId)
      .order('fecha', { ascending: false });

    if (error) throw error;
    return data as Resena[];
  }

  async enviarResena(peliculaId: string, calificacion: number, comentario: string) {
    const usuario = this.authService.usuarioActual();
    if (!usuario) throw new Error('Debes iniciar sesión para comentar.');

    // Se vuelve a controlar al enviar: el formulario puede haber quedado abierto
    const permiso = await this.puedeDejarResena(peliculaId);
    if (!permiso.puede) throw new Error(mensajeEstadoResena(permiso));

    const { data, error } = await this.supabase
      .from('resenas')
      .insert({
        perfil_id: usuario.id,
        pelicula_id: peliculaId,
        calificacion,
        comentario
      });

    if (error) {
      if (error.code === '23505') throw new Error('Ya has calificado esta película.');
      throw error;
    }

    return data;
  }

  /**
   * ¿Puede el usuario reseñar esta película?
   * Regla: tiene una entrada VALIDADA (entró a la sala) de una función que YA TERMINÓ
   * (inicio + duración de la película). Recién ahí la vio completa.
   *
   * Estados: no_logueado · ya_comentada · no_vista (sin entrada validada)
   *          · en_curso (validada, pero la función todavía no terminó) · puede_comentar
   */
  async puedeDejarResena(peliculaId: string): Promise<EstadoResena> {
    const usuario = this.authService.usuarioActual();
    if (!usuario) return { puede: false, estado: 'no_logueado' };

    const [{ data: resenaExistente }, { data: entradas, error }] = await Promise.all([
      this.supabase.from('resenas').select('id')
        .eq('perfil_id', usuario.id).eq('pelicula_id', peliculaId).maybeSingle(),
      this.supabase.from('entradas')
        .select('compras!inner ( perfil_id ), funciones!inner ( pelicula_id, fecha_hora, peliculas ( duracion_minutos ) )')
        .eq('compras.perfil_id', usuario.id)
        .eq('estado', 'validada')
        .eq('funciones.pelicula_id', peliculaId)
    ]);

    if (resenaExistente) return { puede: false, estado: 'ya_comentada' };
    if (error || !entradas || entradas.length === 0) return { puede: false, estado: 'no_vista' };

    const fines = (entradas as unknown as FilaEntradaResena[])
      .map(e => finDeFuncion(e.funciones?.fecha_hora, e.funciones?.peliculas?.duracion_minutos))
      .filter((f): f is Date => f !== null);

    const ahora = Date.now();
    if (fines.some(f => f.getTime() <= ahora)) return { puede: true, estado: 'puede_comentar' };

    // Entrada validada pero la función sigue en curso: avisamos a qué hora termina
    const proximoFin = fines.length ? new Date(Math.min(...fines.map(f => f.getTime()))) : undefined;
    return { puede: false, estado: 'en_curso', terminaEn: proximoFin };
  }
}

