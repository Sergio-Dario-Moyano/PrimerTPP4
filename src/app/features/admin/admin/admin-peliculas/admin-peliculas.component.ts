import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';
import { ImageDropzoneComponent } from '../../../../shared/components/image-dropzone/image-dropzone.component';
import { MascaraFechaDirective } from '../../../../shared/directives/mascara-fecha.directive';
import { AdminAccionDirective } from '../../../../directives/admin-accion';
import { fechaValidator, parsearFecha, aFechaBD, aTimestampBD, desdeBD, aTextoFecha } from '../../../../shared/utils/fechas';
import { DIAS_PREVENTA, enPreventa } from '../../../../core/utils/precios';
import { ErrorCampoDirective } from '../../../../shared/directives/error-campo.directive';

interface Genero { id: number; nombre: string; }

export interface PeliculaAdmin {
  id: string;
  titulo: string;
  sinopsis: string;
  duracion_minutos: number;
  url_imagen: string;
  hero_imagen: string;
  restriccion_edad: number;
  precio_base: number;
  preventa_inicio: string | null;
  preventa_precio: number | null;
  fecha_estreno: string | null;
  estado: 'cartelera' | 'proximamente' | 'archivada';
  pelicula_genero: { genero_id: number }[];
}

/**
 * ABM de películas: alta, edición, imágenes por drag & drop,
 * estado (cartelera / próximamente / archivada), estreno y preventa.
 */
@Component({
  selector: 'app-admin-peliculas',
  standalone: true,
  imports: [ReactiveFormsModule, ErrorCampoDirective, CurrencyPipe, DatePipe, ImageDropzoneComponent, MascaraFechaDirective, AdminAccionDirective],
  templateUrl: './admin-peliculas.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminPeliculasComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;
  private log = inject(LogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  /** Propuesta de un cliente desde la que se está creando la película. */
  propuesta = signal<{ id: string; titulo: string; perfil_id: string; autor: string } | null>(null);

  readonly DIAS_PREVENTA = DIAS_PREVENTA;

  peliculas = signal<PeliculaAdmin[]>([]);
  generos = signal<Genero[]>([]);
  generosSeleccionados = signal<number[]>([]);
  editando = signal<PeliculaAdmin | null>(null);

  cargando = signal<boolean>(false);
  mensajeExito = signal<string>('');
  mensajeError = signal<string>('');

  form = this.fb.nonNullable.group({
    titulo: ['', [Validators.required, Validators.minLength(2)]],
    sinopsis: ['', [Validators.required, Validators.minLength(10)]],
    duracion_minutos: [null as number | null, [Validators.required, Validators.min(30), Validators.max(300)]],
    url_imagen: ['', [Validators.required]],
    hero_imagen: ['', [Validators.required]],
    restriccion_edad: [0, [Validators.required]],
    precio_base: [null as number | null, [Validators.required, Validators.min(1)]],
    estado: ['cartelera' as PeliculaAdmin['estado'], [Validators.required]],
    fecha_estreno: ['', [fechaValidator]],
    con_preventa: [false],
    preventa_precio: [null as number | null, [Validators.min(0)]]
  });

  constructor() {
    // Campos obligatorios según el caso: estreno (próximamente / preventa) y precio de preventa
    this.form.controls.estado.valueChanges.subscribe(() => this.actualizarObligatorios());
    this.form.controls.con_preventa.valueChanges.subscribe(() => this.actualizarObligatorios());
  }

  private actualizarObligatorios(): void {
    const { estado, con_preventa, fecha_estreno, preventa_precio } = this.form.controls;
    const pideEstreno = estado.value === 'proximamente' || con_preventa.value;

    if (pideEstreno) fecha_estreno.addValidators(Validators.required);
    else fecha_estreno.removeValidators(Validators.required);

    if (con_preventa.value) preventa_precio.addValidators([Validators.required, Validators.min(1)]);
    else preventa_precio.removeValidators([Validators.required, Validators.min(1)]);

    fecha_estreno.updateValueAndValidity();
    preventa_precio.updateValueAndValidity();
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.cargarGeneros(), this.cargarPeliculas()]);

    const propuestaId = this.route.snapshot.queryParamMap.get('propuesta');
    if (propuestaId) await this.cargarPropuesta(propuestaId);
  }

  /** Precarga el formulario con lo que envió el cliente. */
  private async cargarPropuesta(id: string): Promise<void> {
    const { data } = await this.supabase
      .from('propuestas')
      .select('id, titulo, descripcion, perfil_id, estado, perfiles!propuestas_perfil_id_fkey ( nombre, apellido )')
      .eq('id', id)
      .single();
    if (!data || data.estado !== 'pendiente') {
      this.mensajeError.set('La propuesta ya no está pendiente.');
      return;
    }
    const autor = data.perfiles as unknown as { nombre: string; apellido: string } | null;
    this.propuesta.set({
      id: data.id, titulo: data.titulo, perfil_id: data.perfil_id,
      autor: autor ? `${autor.nombre} ${autor.apellido}`.trim() : 'un cliente'
    });
    this.form.patchValue({ titulo: data.titulo, sinopsis: data.descripcion, estado: 'proximamente' });
  }

  descartarPropuesta(): void {
    this.propuesta.set(null);
    this.form.reset();
    this.router.navigate([], { queryParams: {} });
  }

  /** Al crear la película, la propuesta queda aceptada y se avisa al cliente. */
  private async cerrarPropuesta(peliculaId: string, titulo: string): Promise<void> {
    const p = this.propuesta();
    if (!p) return;
    const { data: auth } = await this.supabase.auth.getUser();
    await this.supabase.from('propuestas').update({
      estado: 'aceptada', pelicula_id: peliculaId,
      respuesta: '¡La sumamos! Pronto la vas a ver en cartelera.',
      revisado_por: auth?.user?.id ?? null, revisado_en: new Date().toISOString()
    }).eq('id', p.id);
    await this.supabase.from('notificaciones').insert({
      perfil_id: p.perfil_id, tipo: 'propuesta', titulo: '¡Aceptamos tu propuesta!',
      mensaje: `Vamos a proyectar "${titulo}". Gracias por la sugerencia.`, link: `/pelicula/${peliculaId}`
    });
    await this.log.registrar('ACEPTAR_PROPUESTA', 'propuestas', p.id, `Se aceptó la propuesta de ${p.autor}: "${titulo}"`);
    this.propuesta.set(null);
    this.router.navigate([], { queryParams: {} });
  }

  async cargarGeneros(): Promise<void> {
    const { data } = await this.supabase.from('generos').select('id, nombre').order('nombre');
    this.generos.set(data ?? []);
  }

  async cargarPeliculas(): Promise<void> {
    const { data, error } = await this.supabase
      .from('peliculas')
      .select('*, pelicula_genero ( genero_id )')
      .order('creado_en', { ascending: false });
    if (error) { console.error(error); return; }
    this.peliculas.set((data ?? []) as PeliculaAdmin[]);
  }

  toggleGenero(id: number): void {
    const actual = this.generosSeleccionados();
    this.generosSeleccionados.set(actual.includes(id) ? actual.filter(g => g !== id) : [...actual, id]);
  }

  estaEnPreventa(p: PeliculaAdmin): boolean {
    return enPreventa(p);
  }

  editar(p: PeliculaAdmin): void {
    this.editando.set(p);
    this.generosSeleccionados.set(p.pelicula_genero.map(g => g.genero_id));
    this.form.reset({
      titulo: p.titulo,
      sinopsis: p.sinopsis,
      duracion_minutos: p.duracion_minutos,
      url_imagen: p.url_imagen,
      hero_imagen: p.hero_imagen ?? '',
      restriccion_edad: p.restriccion_edad ?? 0,
      precio_base: p.precio_base,
      estado: p.estado,
      fecha_estreno: aTextoFecha(desdeBD(p.fecha_estreno)),
      con_preventa: p.preventa_precio != null,
      preventa_precio: p.preventa_precio
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion(): void {
    this.editando.set(null);
    this.generosSeleccionados.set([]);
    this.form.reset();
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.generosSeleccionados().length === 0) {
      this.form.markAllAsTouched();
      this.mensajeError.set(this.generosSeleccionados().length === 0 && this.form.valid
        ? 'Elegí al menos un género.'
        : 'Revisá los campos marcados con * (¿faltan las imágenes o el género?).');
      return;
    }

    const v = this.form.getRawValue();
    const estreno = v.fecha_estreno ? parsearFecha(v.fecha_estreno) : null;

    if (v.estado === 'proximamente' && !estreno) {
      this.mensajeError.set('Las películas "Próximamente" necesitan fecha de estreno.');
      return;
    }
    if (v.con_preventa && (v.preventa_precio == null || Number(v.preventa_precio) <= 0)) {
      this.mensajeError.set('Ingresá el precio de preventa.');
      return;
    }
    if (v.con_preventa && Number(v.preventa_precio) >= Number(v.precio_base)) {
      this.mensajeError.set('El precio de preventa tiene que ser menor al precio normal de la entrada.');
      return;
    }
    if (v.con_preventa && !estreno) {
      this.mensajeError.set('Para habilitar la preventa hace falta la fecha de estreno.');
      return;
    }

    // La preventa abre 7 días antes del estreno
    let preventaInicio: string | null = null;
    if (v.con_preventa && estreno) {
      const inicio = new Date(estreno);
      inicio.setDate(inicio.getDate() - DIAS_PREVENTA);
      preventaInicio = aTimestampBD(inicio);
    }

    const payload = {
      titulo: v.titulo.trim(),
      sinopsis: v.sinopsis.trim(),
      duracion_minutos: Number(v.duracion_minutos),
      url_imagen: v.url_imagen,
      hero_imagen: v.hero_imagen,
      restriccion_edad: Number(v.restriccion_edad),
      precio_base: Number(v.precio_base),
      estado: v.estado,
      fecha_estreno: estreno ? aFechaBD(estreno) : null,
      preventa_inicio: preventaInicio,
      preventa_precio: v.con_preventa ? Number(v.preventa_precio) : null
    };

    this.cargando.set(true);
    this.mensajeError.set('');
    this.mensajeExito.set('');

    try {
      const anterior = this.editando();
      let peliculaId: string;

      if (anterior) {
        const { error } = await this.supabase.from('peliculas').update(payload).eq('id', anterior.id);
        if (error) throw error;
        peliculaId = anterior.id;
        await this.registrarCambios(anterior, payload);
      } else {
        const { data, error } = await this.supabase.from('peliculas').insert([payload]).select('id').single();
        if (error) throw error;
        peliculaId = data.id;
        await this.log.registrar('CREAR_PELICULA', 'peliculas', peliculaId,
          `Se creó la película "${payload.titulo}" (${payload.estado}) a $${payload.precio_base}`);
        await this.cerrarPropuesta(peliculaId, payload.titulo);
      }

      // Géneros: se reemplazan todas las relaciones
      await this.supabase.from('pelicula_genero').delete().eq('pelicula_id', peliculaId);
      const generos = this.generosSeleccionados();
      if (generos.length > 0) {
        const { error } = await this.supabase.from('pelicula_genero')
          .insert(generos.map(genero_id => ({ pelicula_id: peliculaId, genero_id })));
        if (error) throw error;
      }

      this.mensajeExito.set(anterior ? `"${payload.titulo}" actualizada.` : `"${payload.titulo}" creada.`);
      this.cancelarEdicion();
      await this.cargarPeliculas();
    } catch (err) {
      console.error(err);
      this.mensajeError.set(err instanceof Error ? err.message : 'No se pudo guardar la película.');
    } finally {
      this.cargando.set(false);
      setTimeout(() => this.mensajeExito.set(''), 4000);
    }
  }

  /** Log detallado: los cambios de precio se registran aparte (mail 10/03). */
  private async registrarCambios(antes: PeliculaAdmin, despues: Partial<PeliculaAdmin>): Promise<void> {
    if (Number(antes.precio_base) !== Number(despues.precio_base)) {
      await this.log.registrar('MODIFICAR_PRECIO', 'peliculas', antes.id,
        `Precio de "${antes.titulo}": $${antes.precio_base} → $${despues.precio_base}`);
    }
    if ((antes.preventa_precio ?? null) !== (despues.preventa_precio ?? null)) {
      await this.log.registrar('MODIFICAR_PRECIO', 'peliculas', antes.id,
        `Precio de preventa de "${antes.titulo}": ${antes.preventa_precio ?? 'sin preventa'} → ${despues.preventa_precio ?? 'sin preventa'}`);
    }
    if (antes.estado !== despues.estado) {
      await this.log.registrar('MODIFICAR_PELICULA', 'peliculas', antes.id,
        `Estado de "${antes.titulo}": ${antes.estado} → ${despues.estado}`);
    }
    await this.log.registrar('MODIFICAR_PELICULA', 'peliculas', antes.id, `Se editó la película "${despues.titulo}"`);
  }

  async archivar(p: PeliculaAdmin): Promise<void> {
    const nuevoEstado = p.estado === 'archivada' ? 'cartelera' : 'archivada';
    const { error } = await this.supabase.from('peliculas').update({ estado: nuevoEstado }).eq('id', p.id);
    if (error) { this.mensajeError.set(error.message); return; }
    await this.log.registrar('MODIFICAR_PELICULA', 'peliculas', p.id, `Estado de "${p.titulo}": ${p.estado} → ${nuevoEstado}`);
    await this.cargarPeliculas();
  }
}
