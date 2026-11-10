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
        ),
        funciones ( formato, idioma, fecha_hora )
      `)
      // En cartelera, o "próximamente" cuya fecha de estreno ya llegó
      .or(`estado.eq.cartelera,and(estado.eq.proximamente,fecha_estreno.lte.${this.hoy()})`);

    if (error) throw error;
    return { data };
  }

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
