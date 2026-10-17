import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminAccionDirective } from '../../../../directives/admin-accion';
import { SupabaseService } from '../../../../core/services/supabase';

export interface CuponAdmin {
  id: string;
  codigo: string;
  porcentaje_descuento: number;
  solo_mayores_50: boolean;
  activo: boolean;
}

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

  // Signals de estado local para Películas
  cargando = signal<boolean>(false);
  mensajeExito = signal<string>('');
  mensajeError = signal<string>('');

  // Signals para géneros de películas
  generosDisponibles = signal<any[]>([]);
  generosSeleccionados = signal<number[]>([]);

  // Signals y estado para el módulo de Funciones (Asignación Automática)
  cargandoFuncion = signal<boolean>(false);
  mensajeFuncionExito = signal<string>('');
  mensajeFuncionError = signal<string>('');
  peliculasDisponibles = signal<any[]>([]);

  // Signals y estado para el módulo de Cupones
  cargandoCupon = signal<boolean>(false);
  cupones = signal<CuponAdmin[]>([]);
  mensajeCuponExito = signal<string>('');
  mensajeCuponError = signal<string>('');

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

  // Formulario exclusivo para Programar Funciones
  funcionForm: FormGroup = this.fb.group({
    pelicula_id: ['', [Validators.required]],
    fecha_hora: ['', [Validators.required]],
    formato: ['2D', [Validators.required]],
    idioma: ['castellano', [Validators.required]]
  });

  // Formulario exclusivo para Gestión de Cupones
  cuponForm: FormGroup = this.fb.group({
    codigo: ['', [Validators.required, Validators.minLength(3)]],
    porcentaje_descuento: [20, [Validators.required, Validators.min(1), Validators.max(100)]],
    solo_mayores_50: [false],
    activo: [true]
  });

  async ngOnInit() {
    await this.cargarGeneros();
    await this.cargarPeliculasParaSelect();
    await this.cargarCupones();
  }

  async cargarGeneros() {
    try {
      const { data, error } = await this.supabase.from('generos').select('*');
      if (error) throw error;
      this.generosDisponibles.set(data || []);
    } catch (err) {
      console.error('Error cargando géneros:', err);
    }
  }

  async cargarPeliculasParaSelect() {
    try {
      const { data, error } = await this.supabase.from('peliculas').select('id, titulo, duracion_minutos');
      if (error) throw error;
      this.peliculasDisponibles.set(data || []);
    } catch (err) {
      console.error('Error cargando películas para selector:', err);
    }
  }

  async cargarCupones() {
    try {
      const { data, error } = await this.supabase.from('cupones').select('*').order('codigo', { ascending: true });
      if (error) throw error;
      this.cupones.set(data || []);
    } catch (err) {
      console.error('Error cargando cupones:', err);
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
      const { data: peliInsertada, error: peliError } = await this.supabase
        .from('peliculas')
        .insert([nuevaPeli])
        .select()
        .single();

      if (peliError) throw peliError;

      const generosIds = this.generosSeleccionados();
      if (peliInsertada && generosIds.length > 0) {
        const relaciones = generosIds.map(genero_id => ({
          pelicula_id: peliInsertada.id,
          genero_id: genero_id
        }));
        const { error: relError } = await this.supabase.from('pelicula_genero').insert(relaciones);
        if (relError) throw relError;
      }

      const { data: authData } = await this.supabase.auth.getUser();
      if (authData?.user) {
        await this.supabase.from('logs_actividad').insert([{
          perfil_id: authData.user.id,
          accion: 'CREAR_PELICULA',
          entidad_afectada: 'peliculas',
          entidad_id: peliInsertada.id,
          detalle: `Se registró la película "${nuevaPeli.titulo}"`
        }]);
      }

      this.mensajeExito.set(`¡Película "${nuevaPeli.titulo}" y géneros registrados con éxito!`);
      this.peliculaForm.reset({ duracion_minutos: 120, restriccion_edad: 13, precio_base: 5000, estado: 'cartelera' });
      this.generosSeleccionados.set([]);
      await this.cargarPeliculasParaSelect();
    } catch (error: any) {
      console.error(error);
      this.mensajeError.set(error.message || 'Error al registrar la película.');
    } finally {
      this.cargando.set(false);
      setTimeout(() => this.mensajeExito.set(''), 4000);
    }
  }

  async guardarFuncion() {
    if (this.funcionForm.invalid) {
      this.funcionForm.markAllAsTouched();
      return;
    }

    this.cargandoFuncion.set(true);
    this.mensajeFuncionError.set('');
    this.mensajeFuncionExito.set('');

    try {
      const formVal = this.funcionForm.getRawValue();
      const { data: authData } = await this.supabase.auth.getUser();
      const usuarioId = authData?.user?.id;

      if (!usuarioId) throw new Error('Usuario administrador no autenticado.');

      const { data: peli, error: errPeli } = await this.supabase
        .from('peliculas')
        .select('titulo, duracion_minutos')
        .eq('id', formVal.pelicula_id)
        .single();

      if (errPeli || !peli) throw new Error('No se encontró la película seleccionada.');

      const duracionMinutos = peli.duracion_minutos;
      const inicioNueva = new Date(formVal.fecha_hora.replace(' ', 'T'));
      const finNueva = new Date(inicioNueva.getTime() + (duracionMinutos + 30) * 60000);

      const { data: salas, error: errSalas } = await this.supabase.from('salas').select('id, nombre');
      if (errSalas || !salas) throw new Error('Error al cargar las salas del cine.');

      const { data: funcionesExistentes, error: errFunc } = await this.supabase
        .from('funciones')
        .select(`id, sala_id, fecha_hora, peliculas ( duracion_minutos )`);

      if (errFunc) throw errFunc;

      let salaAsignadaId: number | null = null;
      for (const sala of salas) {
        let salaOcupada = false;
        for (const f of (funcionesExistentes || [])) {
          if (f.sala_id === sala.id) {
            const fInicio = new Date(f.fecha_hora.replace(' ', 'T'));
            const peliDuracion = (f.peliculas as any)?.duracion_minutos || 120;
            const fFin = new Date(fInicio.getTime() + (peliDuracion + 30) * 60000);

            if (inicioNueva < fFin && finNueva > fInicio) {
              salaOcupada = true;
              break;
            }
          }
        }
        if (!salaOcupada) {
          salaAsignadaId = sala.id;
          break;
        }
      }

      if (!salaAsignadaId) {
        throw new Error('No hay salas disponibles en este horario (se requiere un margen de 30 minutos entre funciones).');
      }

      const { data: nuevaFuncion, error: errInsert } = await this.supabase
        .from('funciones')
        .insert([{
          pelicula_id: formVal.pelicula_id,
          sala_id: salaAsignadaId,
          fecha_hora: formVal.fecha_hora,
          formato: formVal.formato,
          idioma: formVal.idioma
        }])
        .select()
        .single();

      if (errInsert) throw errInsert;

      await this.supabase.from('logs_actividad').insert([{
        perfil_id: usuarioId,
        accion: 'CREAR_FUNCION',
        entidad_afectada: 'funciones',
        entidad_id: nuevaFuncion.id,
        detalle: `Se programó "${peli.titulo}" en la Sala ${salaAsignadaId} para el ${formVal.fecha_hora}`
      }]);

      this.mensajeFuncionExito.set(`¡Función programada y asignada a la Sala ${salaAsignadaId} con éxito!`);
      this.funcionForm.reset({ formato: '2D', idioma: 'castellano' });
    } catch (error: any) {
      console.error(error);
      this.mensajeFuncionError.set(error.message || 'Error al programar la función.');
    } finally {
      this.cargandoFuncion.set(false);
      setTimeout(() => this.mensajeFuncionExito.set(''), 5000);
    }
  }

  async guardarCupon() {
    if (this.cuponForm.invalid) {
      this.cuponForm.markAllAsTouched();
      return;
    }

    this.cargandoCupon.set(true);
    this.mensajeCuponError.set('');
    this.mensajeCuponExito.set('');

    try {
      const formVal = this.cuponForm.getRawValue();
      const codigoUpper = formVal.codigo.trim().toUpperCase();
      const { data: authData } = await this.supabase.auth.getUser();
      const usuarioId = authData?.user?.id;

      const { data: nuevoCupon, error: errInsert } = await this.supabase
        .from('cupones')
        .insert([{
          codigo: codigoUpper,
          porcentaje_descuento: Number(formVal.porcentaje_descuento),
          solo_mayores_50: formVal.solo_mayores_50,
          activo: formVal.activo
        }])
        .select()
        .single();

      if (errInsert) throw errInsert;

      if (usuarioId) {
        await this.supabase.from('logs_actividad').insert([{
          perfil_id: usuarioId,
          accion: 'CREAR_CUPON',
          entidad_afectada: 'cupones',
          entidad_id: nuevoCupon.id,
          detalle: `Se creó el cupón ${codigoUpper} con ${formVal.porcentaje_descuento}% de descuento`
        }]);
      }

      this.mensajeCuponExito.set(`¡Cupón "${codigoUpper}" creado con éxito!`);
      this.cuponForm.reset({ porcentaje_descuento: 20, solo_mayores_50: false, activo: true });
      await this.cargarCupones();
    } catch (err: any) {
      console.error(err);
      this.mensajeCuponError.set(err.message || 'Error al guardar el cupón.');
    } finally {
      this.cargandoCupon.set(false);
      setTimeout(() => this.mensajeCuponExito.set(''), 4000);
    }
  }

  async toggleEstadoCupon(cupon: CuponAdmin) {
    try {
      const nuevoEstado = !cupon.activo;
      const { error } = await this.supabase.from('cupones').update({ activo: nuevoEstado }).eq('id', cupon.id);
      if (error) throw error;

      const { data: authData } = await this.supabase.auth.getUser();
      if (authData?.user) {
        await this.supabase.from('logs_actividad').insert([{
          perfil_id: authData.user.id,
          accion: 'MODIFICAR_CUPON',
          entidad_afectada: 'cupones',
          entidad_id: cupon.id,
          detalle: `Se cambió el estado del cupón ${cupon.codigo} a activo: ${nuevoEstado}`
        }]);
      }

      await this.cargarCupones();
    } catch (err) {
      console.error('Error al cambiar estado del cupón:', err);
    }
  }
}
