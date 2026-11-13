import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';
import { PermisosService, SECCIONES_ADMIN } from '../../../../core/services/permisos.service';
import { ModalService } from '../../../../core/services/modal.service';
import { ErrorCampoDirective } from '../../../../shared/directives/error-campo.directive';

interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  permisos: string[];
}

interface Usuario {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  rol: string;
  rol_id: string | null;
}

const ROLES_BASE = [
  { valor: 'cliente', etiqueta: 'Cliente' },
  { valor: 'empleado_cine', etiqueta: 'Empleado de sala' },
  { valor: 'empleado_candy', etiqueta: 'Empleado de candy' },
  { valor: 'admin', etiqueta: 'Administrador (acceso total)' }
];

/**
 * Roles configurables (mail "RPP final"): el admin crea roles con las secciones
 * del panel que habilitan (ej. "solo Reportes") y se los asigna a usuarios.
 */
@Component({
  selector: 'app-admin-roles',
  standalone: true,
  imports: [ReactiveFormsModule, ErrorCampoDirective, NgTemplateOutlet],
  templateUrl: './admin-roles.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminRolesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;
  private log = inject(LogService);
  private permisosService = inject(PermisosService);
  private modalService = inject(ModalService);

  readonly SECCIONES = SECCIONES_ADMIN;
  readonly ROLES_BASE = ROLES_BASE;

  roles = signal<Rol[]>([]);
  editando = signal<Rol | null>(null);
  permisosElegidos = signal<string[]>([]);

  busqueda = signal<string>('');
  resultados = signal<Usuario[]>([]);
  conRol = signal<Usuario[]>([]);

  mensajeExito = signal('');
  mensajeError = signal('');

  nombrePermiso = computed(() => {
    const mapa = new Map<string, string>(SECCIONES_ADMIN.map(s => [s.clave, `${s.icono} ${s.titulo}`]));
    return (clave: string) => mapa.get(clave) ?? clave;
  });

  nombreRol = computed(() => {
    const mapa = new Map(this.roles().map(r => [r.id, r.nombre]));
    return (id: string | null) => (id ? mapa.get(id) : null) ?? '—';
  });

  form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    descripcion: ['']
  });

  async ngOnInit(): Promise<void> {
    await Promise.all([this.cargarRoles(), this.cargarUsuariosConRol()]);
  }

  async cargarRoles(): Promise<void> {
    const { data } = await this.supabase.from('roles').select('*').order('nombre');
    this.roles.set((data ?? []) as Rol[]);
  }

  /** Usuarios con algún permiso de staff: rol base distinto de cliente o un rol configurable. */
  async cargarUsuariosConRol(): Promise<void> {
    const { data } = await this.supabase
      .from('perfiles')
      .select('id, nombre, apellido, email, rol, rol_id')
      .or('rol.neq.cliente,rol_id.not.is.null')
      .order('nombre');
    this.conRol.set((data ?? []) as Usuario[]);
  }

  private ok(texto: string): void {
    this.mensajeError.set('');
    this.mensajeExito.set(texto);
    setTimeout(() => this.mensajeExito.set(''), 4000);
  }

  // ---------- Roles ----------

  togglePermiso(clave: string): void {
    const actual = this.permisosElegidos();
    this.permisosElegidos.set(actual.includes(clave) ? actual.filter(p => p !== clave) : [...actual, clave]);
  }

  editar(r: Rol): void {
    this.editando.set(r);
    this.form.reset({ nombre: r.nombre, descripcion: r.descripcion ?? '' });
    this.permisosElegidos.set([...r.permisos]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelar(): void {
    this.editando.set(null);
    this.form.reset();
    this.permisosElegidos.set([]);
  }

  async guardarRol(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.permisosElegidos().length === 0) {
      this.mensajeError.set('Elegí al menos una sección para el rol.');
      return;
    }
    const v = this.form.getRawValue();
    const payload = { nombre: v.nombre.trim(), descripcion: v.descripcion.trim() || null, permisos: this.permisosElegidos() };
    const anterior = this.editando();

    const { data, error } = anterior
      ? await this.supabase.from('roles').update(payload).eq('id', anterior.id).select('id').single()
      : await this.supabase.from('roles').insert(payload).select('id').single();

    if (error) {
      this.mensajeError.set(error.code === '23505' ? `Ya existe un rol "${payload.nombre}".` : error.message);
      return;
    }
    await this.log.registrar(anterior ? 'MODIFICAR_ROL' : 'CREAR_ROL', 'roles', data.id,
      `Rol "${payload.nombre}": ${payload.permisos.map(p => this.nombrePermiso()(p)).join(', ')}`);
    this.ok(anterior ? `Rol "${payload.nombre}" actualizado.` : `Rol "${payload.nombre}" creado.`);
    this.cancelar();
    await this.cargarRoles();
  }

  async eliminarRol(r: Rol): Promise<void> {
    const usuarios = this.conRol().filter(u => u.rol_id === r.id).length;
    if (!(await this.modalService.confirmar('Eliminar rol', `¿Eliminar el rol "${r.nombre}"?${usuarios ? ` ${usuarios} usuario(s) lo van a perder.` : ''}`, 'Eliminar'))) return;
    const { error } = await this.supabase.from('roles').delete().eq('id', r.id);
    if (error) { this.mensajeError.set(error.message); return; }
    await this.log.registrar('ELIMINAR_ROL', 'roles', r.id, `Se eliminó el rol "${r.nombre}"`);
    this.ok(`Rol "${r.nombre}" eliminado.`);
    await Promise.all([this.cargarRoles(), this.cargarUsuariosConRol()]);
  }

  // ---------- Asignación ----------

  async buscar(): Promise<void> {
    const texto = this.busqueda().trim();
    if (texto.length < 2) { this.resultados.set([]); return; }
    // Se quitan caracteres que rompen el filtro .or() de PostgREST
    const patron = `%${texto.replace(/[,()%*]/g, '')}%`;
    const { data } = await this.supabase
      .from('perfiles')
      .select('id, nombre, apellido, email, rol, rol_id')
      .or(`email.ilike.${patron},nombre.ilike.${patron},apellido.ilike.${patron}`)
      .limit(10);
    this.resultados.set((data ?? []) as Usuario[]);
  }

  // Cambios elegidos en los selects que todavía no se guardaron (clave: id del usuario)
  pendientes = signal<Record<string, { rol: string; rol_id: string | null }>>({});
  guardando = signal<string | null>(null);

  /** Valor que muestra la fila: el pendiente si lo hay, si no el guardado. */
  valorFila(u: Usuario): { rol: string; rol_id: string | null } {
    return this.pendientes()[u.id] ?? { rol: u.rol, rol_id: u.rol_id };
  }

  tienePendiente(u: Usuario): boolean {
    const p = this.pendientes()[u.id];
    return !!p && (p.rol !== u.rol || p.rol_id !== u.rol_id);
  }

  onRolBase(u: Usuario, e: Event): void {
    this.marcarPendiente(u, { rol: (e.target as HTMLSelectElement).value });
  }

  onRolConfig(u: Usuario, e: Event): void {
    const valor = (e.target as HTMLSelectElement).value;
    this.marcarPendiente(u, { rol_id: valor || null });
  }

  private marcarPendiente(u: Usuario, cambio: Partial<{ rol: string; rol_id: string | null }>): void {
    this.mensajeExito.set('');
    this.pendientes.update(p => ({ ...p, [u.id]: { ...this.valorFila(u), ...cambio } }));
  }

  descartar(u: Usuario): void {
    this.pendientes.update(p => { const { [u.id]: _, ...resto } = p; return resto; });
  }

  /**
   * Guarda el rol con la RPC asignar_rol (migración 004). Un update directo sobre
   * "perfiles" no sirve: RLS lo bloquea sin dar error y el cambio no queda guardado.
   * La RPC verifica en la base que quien guarda sea administrador y devuelve
   * la fila tal como quedó, así lo que se muestra es lo que realmente se guardó.
   */
  async guardar(u: Usuario): Promise<void> {
    const cambios = this.pendientes()[u.id];
    if (!cambios) return;
    this.mensajeError.set('');

    const { data: auth } = await this.supabase.auth.getUser();
    if (u.id === auth?.user?.id && cambios.rol !== 'admin') {
      this.mensajeError.set('No podés quitarte a vos mismo el rol de administrador.');
      return;
    }

    this.guardando.set(u.id);
    const { data, error } = await this.supabase.rpc('asignar_rol', {
      p_usuario: u.id, p_rol: cambios.rol, p_rol_id: cambios.rol_id
    });
    this.guardando.set(null);

    if (error || !data) {
      this.mensajeError.set(error?.message ?? 'No se pudo guardar el cambio.');
      return;
    }

    const guardado = data as { id: string; rol: string; rol_id: string | null };
    const quien = `${u.nombre} ${u.apellido}`.trim() || u.email;
    const detalle: string[] = [];
    if (guardado.rol !== u.rol) detalle.push(`rol base: ${u.rol} → ${guardado.rol}`);
    if (guardado.rol_id !== u.rol_id) {
      detalle.push(`rol configurable: ${this.nombreRol()(u.rol_id)} → ${this.nombreRol()(guardado.rol_id)}`);
    }
    await this.log.registrar('ASIGNAR_ROL', 'perfiles', u.id, `${quien}: ${detalle.join('; ') || 'sin cambios'}`);

    const actualizar = (lista: Usuario[]) =>
      lista.map(x => x.id === u.id ? { ...x, rol: guardado.rol, rol_id: guardado.rol_id } : x);
    this.resultados.update(actualizar);
    this.descartar(u);
    await this.cargarUsuariosConRol();
    this.ok(`Permisos de ${quien} guardados.`);

    // Si me cambié a mí mismo, recargo mis permisos
    if (u.id === auth?.user?.id) await this.permisosService.cargarPara(u.id, true);
  }
}
