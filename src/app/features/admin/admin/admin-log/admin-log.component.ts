import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SupabaseService } from '../../../../core/services/supabase';

interface LogFila {
  id: string;
  fecha: string;
  accion: string;
  entidad_afectada: string;
  detalle: string | null;
  perfiles: { nombre: string; apellido: string; rol: string } | null;
}

const ETIQUETAS: Record<string, string> = {
  CREAR_PELICULA: 'Creó película', MODIFICAR_PELICULA: 'Editó película',
  CREAR_FUNCION: 'Creó función', ELIMINAR_FUNCION: 'Eliminó función',
  MODIFICAR_PRECIO: 'Cambió precio',
  CREAR_CUPON: 'Creó cupón', MODIFICAR_CUPON: 'Editó cupón',
  CREAR_PRODUCTO: 'Creó producto', MODIFICAR_PRODUCTO: 'Editó producto',
  CREAR_COMBO: 'Creó combo', MODIFICAR_COMBO: 'Editó combo',
  CREAR_CATEGORIA: 'Creó categoría', ELIMINAR_CATEGORIA: 'Eliminó categoría',
  VALIDAR_ENTRADA: 'Validó QR (sala)', VALIDAR_CANDY: 'Validó QR (candy)',
  MODIFICAR_CONFIG: 'Cambió configuración', ASIGNAR_ROL: 'Asignó rol', ELIMINAR_ROL: 'Eliminó rol',
  ACEPTAR_PROPUESTA: 'Aceptó propuesta', RECHAZAR_PROPUESTA: 'Rechazó propuesta', CANCELAR_FUNCION: 'Canceló función'
};

/** Log de actividad (mail 10/03): quién hizo qué y cuándo. */
@Component({
  selector: 'app-admin-log',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-log.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminLogComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  readonly LIMITE = 300;

  logs = signal<LogFila[]>([]);
  cargando = signal<boolean>(true);
  filtroAccion = signal<string>('');
  filtroUsuario = signal<string>('');
  busqueda = signal<string>('');

  acciones = computed(() => [...new Set(this.logs().map(l => l.accion))].sort());
  usuarios = computed(() => [...new Set(this.logs().map(l => this.nombreUsuario(l)))].sort());

  filtrados = computed(() => {
    const accion = this.filtroAccion();
    const usuario = this.filtroUsuario();
    const texto = this.busqueda().toLowerCase();
    return this.logs().filter(l =>
      (!accion || l.accion === accion) &&
      (!usuario || this.nombreUsuario(l) === usuario) &&
      (!texto || (l.detalle ?? '').toLowerCase().includes(texto)));
  });

  async ngOnInit(): Promise<void> {
    const { data, error } = await this.supabase
      .from('logs_actividad')
      .select('id, fecha, accion, entidad_afectada, detalle, perfiles ( nombre, apellido, rol )')
      .order('fecha', { ascending: false })
      .limit(this.LIMITE);
    if (error) console.error(error);
    this.logs.set((data ?? []) as unknown as LogFila[]);
    this.cargando.set(false);
  }

  etiqueta(accion: string): string {
    return ETIQUETAS[accion] ?? accion;
  }

  nombreUsuario(l: LogFila): string {
    return l.perfiles ? `${l.perfiles.nombre} ${l.perfiles.apellido}`.trim() : 'Sistema / sin sesión';
  }

  /** logs_actividad.fecha es timestamp sin zona con default now() (UTC en Supabase). */
  fechaLocal(fecha: string): Date {
    return new Date(fecha.endsWith('Z') ? fecha : `${fecha}Z`);
  }
}
