import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase'; // Asegúrate de que la ruta sea correcta
import { RawPelicula } from '../models/RawPelicula.model'; // 💡 Importamos el tipo crudo

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

    // Retornamos la data asegurándole a TypeScript que cumple con la interfaz RawPelicula
    return data as RawPelicula;
  }

  async agregarPelicula(peliculaData: {
    titulo: string;
    sinopsis: string;
    duracion_minutos: number;
    url_imagen: string;
    hero_imagen: string;
    restriccion_edad: number;
    precio_base: number;
    estado: string;
  }) {
    const { data, error } = await this.supabase
      .from('peliculas')
      .insert([peliculaData]);

    if (error) throw error;
    return data;
  }


}
