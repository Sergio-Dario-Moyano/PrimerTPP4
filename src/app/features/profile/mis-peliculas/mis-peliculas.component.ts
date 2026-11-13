import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../core/services/supabase';
import { ReseniaService, finDeFuncion } from '../../../core/services/resenia.service';
import { desdeBD } from '../../../shared/utils/fechas';

export interface PeliculaHistorial {
  id: string;
  titulo: string;
  url_imagen: string;
  fechaVista: Date | null;
  miCalificacion: number | null;
  miComentario: string | null;
  /** La función ya terminó (inicio + duración): recién ahí se puede calificar. */
  terminada: boolean;
  terminaEn: Date | null;
}

interface FilaEntrada {
  funciones: {
    fecha_hora: string;
    peliculas: { id: string; titulo: string; url_imagen: string; duracion_minutos: number } | null;
  } | null;
}

/**
 * "Mis películas" (mail 08/03): historial visual con póster, fecha y mi calificación.
 * Al tocar un póster se abre en grande con la fecha en que la vi y mi calificación;
 * si todavía no la califiqué, se puede hacer desde ahí.
 */
@Component({
  selector: 'app-mis-peliculas',
  standalone: true,
  imports: [DatePipe, RouterLink, ReactiveFormsModule],
  templateUrl: './mis-peliculas.component.html',
  styleUrls: ['./mis-peliculas.component.css']
})
export class MisPeliculasComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private resenias = inject(ReseniaService);

  readonly ESTRELLAS = [1, 2, 3, 4, 5];

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);
  peliculas = signal<PeliculaHistorial[]>([]);

  /** Id de la película abierta en grande (null = vista cerrada). */
  private seleccionadaId = signal<string | null>(null);
  seleccionada = computed(() => this.peliculas().find(p => p.id === this.seleccionadaId()) ?? null);

  enviando = signal(false);
  errorResena = signal('');
  /** Estrella sobre la que está el mouse, para previsualizar la calificación. */
  estrellaHover = signal(0);

  resenaForm = new FormGroup({
    calificacion: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(5)] }),
    comentario: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] })
  });

  async ngOnInit(): Promise<void> {
    try {
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) throw new Error('Usuario no autenticado');

      // Entradas validadas = películas que efectivamente vio
      const [{ data: entradas, error }, { data: resenas }] = await Promise.all([
        this.supabase
          .from('entradas')
          .select('compras!inner ( perfil_id ), funciones!inner ( fecha_hora, peliculas ( id, titulo, url_imagen, duracion_minutos ) )')
          .eq('compras.perfil_id', userId)
          .eq('estado', 'validada'),
        this.supabase.from('resenas').select('pelicula_id, calificacion, comentario').eq('perfil_id', userId)
      ]);
      if (error) throw error;

      const misResenas = new Map((resenas ?? []).map(r =>
        [r.pelicula_id as string, { calificacion: r.calificacion as number, comentario: r.comentario as string | null }]));
      const porPelicula = new Map<string, PeliculaHistorial>();
      const ahora = Date.now();

      for (const e of (entradas ?? []) as unknown as FilaEntrada[]) {
        const peli = e.funciones?.peliculas;
        if (!peli) continue;
        const fecha = desdeBD(e.funciones!.fecha_hora);
        const fin = finDeFuncion(e.funciones!.fecha_hora, peli.duracion_minutos);
        const terminada = !!fin && fin.getTime() <= ahora;
        const existente = porPelicula.get(peli.id);

        // Si la vio más de una vez, mostramos la última fecha.
        // Alcanza con que una de esas funciones haya terminado para poder calificarla.
        if (!existente || (fecha && existente.fechaVista && fecha > existente.fechaVista)) {
          const resena = misResenas.get(peli.id);
          porPelicula.set(peli.id, {
            id: peli.id, titulo: peli.titulo, url_imagen: peli.url_imagen,
            fechaVista: fecha,
            miCalificacion: resena?.calificacion ?? null,
            miComentario: resena?.comentario ?? null,
            terminada: terminada || !!existente?.terminada,
            terminaEn: fin
          });
        } else if (terminada && !existente.terminada) {
          porPelicula.set(peli.id, { ...existente, terminada: true });
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

  abrir(peli: PeliculaHistorial): void {
    this.resenaForm.reset({ calificacion: 0, comentario: '' });
    this.errorResena.set('');
    this.estrellaHover.set(0);
    this.seleccionadaId.set(peli.id);
  }

  @HostListener('document:keydown.escape')
  cerrar(): void {
    if (!this.enviando()) this.seleccionadaId.set(null);
  }

  elegirEstrella(valor: number): void {
    this.resenaForm.controls.calificacion.setValue(valor);
    this.resenaForm.controls.calificacion.markAsTouched();
  }

  async guardarResena(): Promise<void> {
    const peli = this.seleccionada();
    if (!peli || this.resenaForm.invalid) {
      this.resenaForm.markAllAsTouched();
      return;
    }
    this.enviando.set(true);
    this.errorResena.set('');
    try {
      const { calificacion, comentario } = this.resenaForm.getRawValue();
      // El servicio vuelve a verificar que la función haya terminado y que no exista otra reseña
      await this.resenias.enviarResena(peli.id, calificacion, comentario.trim());
      this.peliculas.update(lista => lista.map(p =>
        p.id === peli.id ? { ...p, miCalificacion: calificacion, miComentario: comentario.trim() } : p));
    } catch (err) {
      this.errorResena.set(err instanceof Error ? err.message : 'No se pudo guardar tu calificación.');
    } finally {
      this.enviando.set(false);
    }
  }
}
