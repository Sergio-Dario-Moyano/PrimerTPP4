import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth.service';
import { Resena } from '../models/Resenia.model';

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

  async puedeDejarResena(peliculaId: string): Promise<{ puede: boolean; estado: string }> {
    const usuario = this.authService.usuarioActual();
    if (!usuario) return { puede: false, estado: 'no_logueado' };

    const perfilId = usuario.id;

    const { data: resenaExistente } = await this.supabase
      .from('resenas')
      .select('id')
      .eq('perfil_id', perfilId)
      .eq('pelicula_id', peliculaId)
      .maybeSingle();

    if (resenaExistente) {
      return { puede: false, estado: 'ya_comentada' };
    }

    const fechaActual = new Date().toISOString();

    const { data: comprasPasadas } = await this.supabase
      .from('compras')
      .select(`
        id,
        entradas!inner (
          id,
          estado,
          funciones!inner (
            pelicula_id,
            fecha_hora
          )
        )
      `)
      .eq('perfil_id', perfilId)
      .eq('estado', 'completada')
      .eq('entradas.estado', 'validada')
      .eq('entradas.funciones.pelicula_id', peliculaId)
      .lt('entradas.funciones.fecha_hora', fechaActual);

    if (!comprasPasadas || comprasPasadas.length === 0) {
      return { puede: false, estado: 'no_vista' };
    }

    return { puede: true, estado: 'puede_comentar' };
  }
}
