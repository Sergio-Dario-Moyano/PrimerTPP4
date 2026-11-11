import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';
import { FuncionesService, ResultadoProgramacion } from '../../../../core/services/funciones.service';
import { ListaEsperaService } from '../../../../core/services/lista-espera.service';
import { MascaraFechaDirective } from '../../../../shared/directives/mascara-fecha.directive';
import { AdminAccionDirective } from '../../../../directives/admin-accion';
import { fechaValidator, horaValidator, parsearFecha, combinarFechaHora, desdeBD } from '../../../../shared/utils/fechas';

interface PeliculaSelect { id: string; titulo: string; duracion_minutos: number; }

interface FuncionListado {
  id: string;
  fecha_hora: string;
  formato: string;
  idioma: string;
  salas: { nombre: string } | null;
  peliculas: { titulo: string } | null;
  entradas: { count: number }[];
  estado: 'activa' | 'cancelada';
  motivo_cancelacion: string | null;
}

interface ResultadoCancelacion { compras: number; anonimas: number; total: number; }

type Modo = 'unica' | 'recurrente';

@Component({
  selector: 'app-admin-funciones',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, MascaraFechaDirective, AdminAccionDirective],
  templateUrl: './admin-funciones.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminFuncionesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;
  private funcionesService = inject(FuncionesService);
  private log = inject(LogService);
  private listaEspera = inject(ListaEsperaService);

  /** Personas en lista de espera por función (mail "RPP final"). */
  enEspera = signal<Map<string, number>>(new Map());

  // Cancelación de funciones
  cancelandoId = signal<string | null>(null);
  motivoCancelacion = signal<string>('');
  procesandoCancelacion = signal<boolean>(false);
  resultadoCancelacion = signal<string>('');

  readonly DIAS = [
    { valor: 1, nombre: 'Lun' }, { valor: 2, nombre: 'Mar' }, { valor: 3, nombre: 'Mié' },
    { valor: 4, nombre: 'Jue' }, { valor: 5, nombre: 'Vie' }, { valor: 6, nombre: 'Sáb' },
    { valor: 0, nombre: 'Dom' }
  ];

  modo = signal<Modo>('unica');
  diasSeleccionados = signal<number[]>([]);
  peliculas = signal<PeliculaSelect[]>([]);
  funciones = signal<FuncionListado[]>([]);
  filtroPelicula = signal<string>('');

  cargando = signal<boolean>(false);
  mensajeError = signal<string>('');
  resultado = signal<ResultadoProgramacion | null>(null);

  funcionesFiltradas = computed(() => {
    const filtro = this.filtroPelicula();
    return filtro ? this.funciones().filter(f => f.peliculas?.titulo === filtro) : this.funciones();
  });

  form = this.fb.nonNullable.group({
    pelicula_id: ['', Validators.required],
    formato: ['2D', Validators.required],
    idioma: ['castellano', Validators.required],
    hora: ['', [Validators.required, horaValidator]],
    fecha: ['', [fechaValidator]],
    desde: ['', [fechaValidator]],
    hasta: ['', [fechaValidator]]
  });

  async ngOnInit(): Promise<void> {
    const { data } = await this.supabase
      .from('peliculas').select('id, titulo, duracion_minutos')
      .neq('estado', 'archivada').order('titulo');
    this.peliculas.set(data ?? []);
    await this.cargarFunciones();
  }

  async cargarFunciones(): Promise<void> {
    const ahora = new Date();
    const desde = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    const { data, error } = await this.supabase
      .from('funciones')
      .select('id, fecha_hora, formato, idioma, estado, motivo_cancelacion, salas ( nombre ), peliculas ( titulo ), entradas ( count )')
      .neq('entradas.estado', 'cancelada')
      .gte('fecha_hora', desde)
      .order('fecha_hora');
    if (error) { console.error(error); return; }
    const funciones = (data ?? []) as unknown as FuncionListado[];
    this.funciones.set(funciones);
    this.enEspera.set(await this.listaEspera.conteoPorFuncion(funciones.map(f => f.id)));
  }

  fechaDe(f: FuncionListado): Date | null { return desdeBD(f.fecha_hora); }

  cambiarModo(m: Modo): void {
    this.modo.set(m);
    this.resultado.set(null);
    this.mensajeError.set('');
  }

  toggleDia(d: number): void {
    const actual = this.diasSeleccionados();
    this.diasSeleccionados.set(actual.includes(d) ? actual.filter(x => x !== d) : [...actual, d]);
  }

  private calcularFechas(): Date[] | string {
    const v = this.form.getRawValue();
    if (this.modo() === 'unica') {
      const f = combinarFechaHora(v.fecha, v.hora);
      return f ? [f] : 'Completá la fecha (dd/mm/aaaa) y la hora (hh:mm).';
    }

    const desde = parsearFecha(v.desde);
    const hasta = parsearFecha(v.hasta);
    if (!desde || !hasta) return 'Completá el rango de fechas (desde / hasta).';
    if (hasta < desde) return 'La fecha "hasta" debe ser posterior a "desde".';
    if (this.diasSeleccionados().length === 0) return 'Elegí al menos un día de la semana.';

    const diffDias = (hasta.getTime() - desde.getTime()) / 86400000;
    if (diffDias > 120) return 'El rango no puede superar los 120 días.';

    const fechas = FuncionesService.generarFechasRecurrentes(desde, hasta, this.diasSeleccionados(), v.hora);
    return fechas.length ? fechas : 'Ningún día del rango coincide con los días elegidos.';
  }

  async programar(): Promise<void> {
    this.mensajeError.set('');
    this.resultado.set(null);

    if (this.form.controls.pelicula_id.invalid || this.form.controls.hora.invalid) {
      this.form.markAllAsTouched();
      this.mensajeError.set('Elegí la película y una hora válida (hh:mm).');
      return;
    }

    const fechas = this.calcularFechas();
    if (typeof fechas === 'string') {
      this.mensajeError.set(fechas);
      return;
    }

    const v = this.form.getRawValue();
    this.cargando.set(true);
    try {
      const res = await this.funcionesService.programar({
        peliculaId: v.pelicula_id, fechas, formato: v.formato, idioma: v.idioma
      });
      this.resultado.set(res);
      await this.cargarFunciones();
    } catch (err) {
      this.mensajeError.set(err instanceof Error ? err.message : 'Error al programar.');
    } finally {
      this.cargando.set(false);
    }
  }

  vendidas(f: FuncionListado): number {
    return f.entradas?.[0]?.count ?? 0;
  }

  iniciarCancelacion(f: FuncionListado): void {
    this.cancelandoId.set(f.id);
    this.motivoCancelacion.set('');
    this.resultadoCancelacion.set('');
  }

  /**
   * Cancela la función con la RPC cancelar_funcion: en UNA transacción acredita a
   * cada comprador el total de su compra (con candy), libera las butacas, notifica
   * y cierra la lista de espera. Si algo falla, no se aplica nada.
   */
  async confirmarCancelacion(f: FuncionListado): Promise<void> {
    const motivo = this.motivoCancelacion().trim();
    if (!motivo) { this.mensajeError.set('Indicá el motivo de la cancelación.'); return; }

    this.procesandoCancelacion.set(true);
    this.mensajeError.set('');
    const { data, error } = await this.supabase.rpc('cancelar_funcion', { p_funcion: f.id, p_motivo: motivo });
    this.procesandoCancelacion.set(false);

    if (error) {
      // La transacción se revirtió completa: nadie recibió crédito
      this.mensajeError.set(`No se canceló la función (no se aplicó ningún cambio): ${error.message}`);
      return;
    }

    const r = data as ResultadoCancelacion;
    this.resultadoCancelacion.set(
      `Función de "${f.peliculas?.titulo}" cancelada. ${r.compras} compra(s) afectada(s), ` +
      `$${Math.round(r.total).toLocaleString('es-AR')} acreditados como crédito` +
      (r.anonimas ? ` (${r.anonimas} anónima(s): el crédito se acredita cuando inicien sesión con su email).` : '.'));
    this.cancelandoId.set(null);
    await this.cargarFunciones();
  }

  async eliminar(f: FuncionListado): Promise<void> {
    if ((f.entradas?.[0]?.count ?? 0) > 0) {
      this.mensajeError.set('No se puede eliminar una función con entradas vendidas.');
      return;
    }
    if (!confirm(`¿Eliminar la función de "${f.peliculas?.titulo}" del ${f.fecha_hora.slice(0, 16)}?`)) return;

    const { error } = await this.supabase.from('funciones').delete().eq('id', f.id);
    if (error) { this.mensajeError.set(error.message); return; }
    await this.log.registrar('ELIMINAR_FUNCION', 'funciones', f.id,
      `Se eliminó la función de "${f.peliculas?.titulo}" (${f.salas?.nombre}) del ${f.fecha_hora.slice(0, 16)}`);
    await this.cargarFunciones();
  }
}
