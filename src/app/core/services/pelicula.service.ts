import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { RawPelicula } from '../models/RawPelicula.model';

@Service()
export class PeliculaService {
  private supabase = inject(SupabaseService).client;

  async getPeliculaById(id: string): Promise<RawPelicula> {
    const { data, error } = await this.supabase
      .from('peliculas')
      .select(`
        *,
        pelicula_genero (
          generos (nombre)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return data as RawPelicula;
  }
}
