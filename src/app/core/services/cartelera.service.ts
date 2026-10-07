import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase';

@Service()
export class CarteleraService {
  private supabase = inject(SupabaseService).client;

  async getPeliculas(): Promise<{ data: any[] | null }> {
    const { data, error } = await this.supabase
      .from('peliculas')
      .select(`
        *,
        pelicula_genero (
          generos (nombre)
        )
      `)
      .eq('estado', 'cartelera');

    if (error) throw error;
    return { data };
  }

  async getCombos(): Promise<{ data: any[] | null }> {
    const { data, error } = await this.supabase
      .from('combos_candy')
      .select('*')
      .eq('activo', true);

    if (error) throw error;
    return { data };
  }
}
