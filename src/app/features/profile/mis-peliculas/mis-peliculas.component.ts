import { Component, OnInit, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';

// Interfaz dedicada para tipar estrictamente el resultado
export interface PeliculaHistorial {
  id: string;
  titulo: string;
  url_imagen: string;
}

@Component({
  selector: 'app-mis-peliculas',
  standalone: true,
  imports: [], // 💡 CommonModule eliminado
  templateUrl: './mis-peliculas.component.html',
  styleUrls: ['./mis-peliculas.component.css']
})
export class MisPeliculasComponent implements OnInit {
  private supabaseService = inject(SupabaseService);

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);
  peliculas = signal<PeliculaHistorial[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const supabase = this.supabaseService.client;
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) throw new Error('Usuario no autenticado');

      // Una sola consulta usando inner joins para buscar
      // entradas validadas de las compras de este usuario específico.
      const { data, error: fetchError } = await supabase
        .from('entradas')
        .select(`
          compras!inner(perfil_id),
          funciones!inner(
            peliculas (
              id,
              titulo,
              url_imagen
            )
          )
        `)
        .eq('compras.perfil_id', authData.user.id)
        .eq('estado', 'validada');//ignoramos las entradas canceladas

      if (fetchError) throw fetchError;

      // Usamos un Map para filtrar duplicados rápidamente
      const peliculasUnicas = new Map<string, PeliculaHistorial>();

      if (data) {
        // Mapeo seguro evitando usar 'any'
        for (const entrada of data as unknown as { funciones: { peliculas: PeliculaHistorial | PeliculaHistorial[] } }[]) {
          const peliData = entrada.funciones?.peliculas;

          // Dependiendo de la relación en BD, Supabase puede devolver un objeto o un array
          const peli = Array.isArray(peliData) ? peliData[0] : peliData;

          if (peli && peli.id && !peliculasUnicas.has(peli.id)) {
            peliculasUnicas.set(peli.id, {
              id: peli.id,
              titulo: peli.titulo,
              url_imagen: peli.url_imagen
            });
          }
        }
      }

      this.peliculas.set(Array.from(peliculasUnicas.values()));

    } catch (err) {
      this.error.set('Error al cargar tu biblioteca. Intenta de nuevo más tarde.');
      console.error('Error cargando mis películas:', err);
    } finally {
      this.cargando.set(false);
    }
  }
}
