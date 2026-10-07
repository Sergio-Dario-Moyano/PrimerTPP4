import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminAccionDirective } from '../../../directives/admin-accion';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-admin-gestion',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AdminAccionDirective],
  templateUrl: './admin-gestion.component.html',
  styleUrl: './admin-gestion.component.css'
})
export class AdminGestionComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;

  // Signals de estado local
  cargando = signal<boolean>(false);
  mensajeExito = signal<string>('');
  mensajeError = signal<string>('');

  // Signals para géneros de películas
  generosDisponibles = signal<any[]>([]);
  generosSeleccionados = signal<number[]>([]);

  // Formulario exclusivo de Película
  peliculaForm: FormGroup = this.fb.group({
    titulo: ['', [Validators.required, Validators.minLength(2)]],
    sinopsis: ['', [Validators.required, Validators.minLength(10)]],
    duracion_minutos: [120, [Validators.required, Validators.min(30), Validators.max(300)]],
    url_imagen: ['', [Validators.required]],
    hero_imagen: ['', [Validators.required]],
    restriccion_edad: [13, [Validators.required]],
    precio_base: [5000, [Validators.required, Validators.min(0)]],
    estado: ['cartelera', [Validators.required]]
  });

  async ngOnInit() {
    await this.cargarGeneros();
  }

  async cargarGeneros() {
    try {
      const { data, error } = await this.supabase
        .from('generos')
        .select('*');
      if (error) throw error;
      this.generosDisponibles.set(data || []);
    } catch (err) {
      console.error('Error cargando géneros:', err);
    }
  }

  toggleGenero(generoId: number) {
    const actual = this.generosSeleccionados();
    if (actual.includes(generoId)) {
      this.generosSeleccionados.set(actual.filter(id => id !== generoId));
    } else {
      this.generosSeleccionados.set([...actual, generoId]);
    }
  }

  async guardarPelicula() {
    if (this.peliculaForm.invalid) {
      this.peliculaForm.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.mensajeError.set('');
    this.mensajeExito.set('');

    try {
      const nuevaPeli = this.peliculaForm.value;

      // Insertar la película y recuperar su ID generado
      const { data: peliInsertada, error: peliError } = await this.supabase
        .from('peliculas')
        .insert([nuevaPeli])
        .select()
        .single();

      if (peliError) throw peliError;

      // Insertar géneros seleccionados en la tabla intermedia
      const generosIds = this.generosSeleccionados();
      if (peliInsertada && generosIds.length > 0) {
        const relaciones = generosIds.map(genero_id => ({
          pelicula_id: peliInsertada.id,
          genero_id: genero_id
        }));

        const { error: relError } = await this.supabase
          .from('pelicula_genero')
          .insert(relaciones);

        if (relError) throw relError;
      }

      this.mensajeExito.set(`¡Película "${nuevaPeli.titulo}" y géneros registrados con éxito!`);
      this.peliculaForm.reset({
        duracion_minutos: 120,
        restriccion_edad: 13,
        precio_base: 5000,
        estado: 'cartelera'
      });
      this.generosSeleccionados.set([]);
    } catch (error: any) {
      console.error(error);
      this.mensajeError.set(error.message || 'Error al registrar la película.');
    } finally {
      this.cargando.set(false);
      setTimeout(() => this.mensajeExito.set(''), 4000);
    }
  }
}
