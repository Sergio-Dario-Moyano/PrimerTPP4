import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';
import { desdeBD } from '../../../shared/utils/fechas';

export interface PeliculaHistorial {
  id: string;
  titulo: string;
  url_imagen: string;
  fechaVista: Date | null;
  miCalificacion: number | null;
}

interface FilaEntrada {
  funciones: {
    fecha_hora: string;
    peliculas: { id: string; titulo: string; url_imagen: string } | null;
  } | null;
}

/** "Mis películas" (mail 08/03): historial visual con póster, fecha y mi calificación. */
@Component({
  selector: 'app-mis-peliculas',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './mis-peliculas.component.html',
  styleUrls: ['./mis-peliculas.component.css']
})
export class MisPeliculasComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  readonly ESTRELLAS = [1, 2, 3, 4, 5];

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);
  peliculas = signal<PeliculaHistorial[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuario no autenticado');

      // Entradas validadas = películas que efectivamente vio
      const [{ data: entradas, error }, { data: resenas }] = await Promise.all([
        this.supabase
          .from('entradas')
          .select('compras!inner ( perfil_id ), funciones!inner ( fecha_hora, peliculas ( id, titulo, url_imagen ) )')
          .eq('compras.perfil_id', userId)
          .eq('estado', 'validada'),
        this.supabase.from('resenas').select('pelicula_id, calificacion').eq('perfil_id', userId)
      ]);
      if (error) throw error;

      const calificaciones = new Map((resenas ?? []).map(r => [r.pelicula_id as string, r.calificacion as number]));
      const porPelicula = new Map<string, PeliculaHistorial>();

      for (const e of (entradas ?? []) as unknown as FilaEntrada[]) {
        const peli = e.funciones?.peliculas;
        if (!peli) continue;
        const fecha = desdeBD(e.funciones!.fecha_hora);
        const existente = porPelicula.get(peli.id);
        // Si la vio más de una vez, mostramos la última fecha
        if (!existente || (fecha && existente.fechaVista && fecha > existente.fechaVista)) {
          porPelicula.set(peli.id, {
            id: peli.id, titulo: peli.titulo, url_imagen: peli.url_imagen,
            fechaVista: fecha, miCalificacion: calificaciones.get(peli.id) ?? null
          });
        }
      }

      this.peliculas.set([...porPelicula.values()]
        .sort((a, b) => (b.fechaVista?.getTime() ?? 0) - (a.fechaVista?.getTime() ?? 0)));
    } catch (err) {
      console.error('Error cargando mis películas:', err);
      this.error.set('Error al cargar tu historial. Intentá de nuevo más tarde.');
    } finally {
      this.cargando.set(false);
    }
  }
}
