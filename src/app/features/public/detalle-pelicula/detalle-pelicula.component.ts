import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';

import { SupabaseService } from '../../../core/services/supabase';
import { PeliculaService } from '../../../core/services/pelicula.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
import { ReseniaService } from '../../../core/services/resenia.service';

import { Pelicula } from '../../../core/models/Pelicula.model';
import { Resena } from '../../../core/models/Resenia.model';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { FuncionPelicula } from '../../../core/models/Funcion.model';
import { FuncionesPeliculaComponent } from '../../../shared/components/funciones-pelicula/funciones-pelicula.component';

type EstadoResenaType = 'cargando' | 'puede_comentar' | 'ya_comentada' | 'no_vista' | 'no_logueado';

@Component({
  selector: 'app-detalle-pelicula',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, FuncionesPeliculaComponent],
  templateUrl: './detalle-pelicula.component.html',
  styleUrls: ['./detalle-pelicula.component.css']
})
export class DetallePeliculaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private peliculaService = inject(PeliculaService);
  private reseniaService = inject(ReseniaService);
  private authService = inject(AuthService);
  private modalService = inject(ModalService);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);

  pelicula = signal<Pelicula | null>(null);
  resenas = signal<Resena[]>([]);
  funciones = signal<FuncionPelicula[]>([]);
  cargando = signal<boolean>(true);
  enviando = signal<boolean>(false);

  estadoResena = signal<EstadoResenaType>('cargando');

  estrellasArray = [1, 2, 3, 4, 5];

  resenaForm = new FormGroup({
    calificacion: new FormControl(0, [Validators.required, Validators.min(1), Validators.max(5)]),
    comentario: new FormControl('', [Validators.required, Validators.maxLength(255)])
  });

  promedioEstrellas = computed(() => {
    const lista = this.resenas();
    if (lista.length === 0) return 0;

    const suma = lista.reduce((acc, curr) => acc + curr.calificacion, 0);
    return Number((suma / lista.length).toFixed(1));
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.cargarDatos(id);
    }
  }

  async cargarDatos(id: string): Promise<void> {
    try {
      this.cargando.set(true);

      const peliculaData: RawPelicula = await this.peliculaService.getPeliculaById(id);
      const resenasData = await this.reseniaService.getResenasPorPelicula(id);
      const funcionesData = await this.supabaseService.client.from('funciones').select('*').eq('pelicula_id', id);
      const estadoResenaData = await this.reseniaService.puedeDejarResena(id);

      const generosMapeados = peliculaData.pelicula_genero && peliculaData.pelicula_genero.length > 0
        ? peliculaData.pelicula_genero.map((rel: any) => rel.generos?.nombre || 'Sin género')
        : ['Sin género'];

      const clasificacion = peliculaData.restriccion_edad === 0 ? 'ATP' : `+${peliculaData.restriccion_edad}`;

      this.pelicula.set({
        id: String(peliculaData.id),
        titulo: peliculaData.titulo,
        sinopsis: peliculaData.sinopsis,
        duracion: Number(peliculaData.duracion_minutos),
        poster_url: peliculaData.url_imagen,
        clasificacion: clasificacion,
        generos: generosMapeados,
        formatos: ['2D', '3D'],
        idiomas: ['Castellano'],
        hero_imagen: peliculaData.hero_imagen
      });

      this.resenas.set(resenasData as Resena[]);
      this.funciones.set((funcionesData.data as FuncionPelicula[]) || []);
      this.estadoResena.set(estadoResenaData.estado as EstadoResenaType);

    } catch (error) {
      console.error('Error al cargar detalle:', error);
    } finally {
      this.cargando.set(false);
    }
  }

  setCalificacionForm(valor: number): void {
    this.resenaForm.controls.calificacion.setValue(valor);
  }

  async enviarResena(): Promise<void> {
    const peli = this.pelicula();
    if (!peli || this.resenaForm.invalid) {
      this.resenaForm.markAllAsTouched();
      return;
    }

    try {
      this.enviando.set(true);
      const form = this.resenaForm.getRawValue();

      await this.reseniaService.enviarResena(peli.id, form.calificacion as number, form.comentario as string);

      this.modalService.open('¡Gracias!', 'Tu reseña ha sido publicada.', 'success');
      this.resenaForm.reset({ calificacion: 0, comentario: '' });

      this.estadoResena.set('ya_comentada');

      const nuevasResenas = await this.reseniaService.getResenasPorPelicula(peli.id);
      this.resenas.set(nuevasResenas as Resena[]);

    } catch (error) {
      const mensajeError = error instanceof Error ? error.message : 'Ocurrió un error al procesar tu reseña.';
      this.modalService.open('Atención', mensajeError, 'error');
    } finally {
      this.enviando.set(false);
    }
  }

  navegarASala(funcion: FuncionPelicula): void {
    this.router.navigate(['/sala', funcion.id], {
      queryParams: {
        horario: funcion.fecha_hora,
        sala: funcion.sala_id
      }
    });
  }
}
