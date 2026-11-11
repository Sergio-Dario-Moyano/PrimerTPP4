import { Service, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase';

/** Secciones del panel que se pueden habilitar en un rol configurable. */
export const SECCIONES_ADMIN = [
  { clave: 'peliculas', ruta: '/admin/peliculas', titulo: 'Películas', icono: '🎬' },
  { clave: 'funciones', ruta: '/admin/funciones', titulo: 'Funciones', icono: '🗓️' },
  { clave: 'candy', ruta: '/admin/candy', titulo: 'Candy Bar y Combos', icono: '🍿' },
  { clave: 'cupones', ruta: '/admin/cupones', titulo: 'Cupones', icono: '🏷️' },
  { clave: 'fidelizacion', ruta: '/admin/fidelizacion', titulo: 'Puntos y Canjes', icono: '⭐' },
  { clave: 'propuestas', ruta: '/admin/propuestas', titulo: 'Propuestas', icono: '💡' },
  { clave: 'reportes', ruta: '/admin/reportes', titulo: 'Reportes', icono: '📊' },
  { clave: 'log', ruta: '/admin/log', titulo: 'Log de Actividad', icono: '📝' },
  { clave: 'validar_sala', ruta: '/admin/validar', titulo: 'Validar QR — Sala', icono: '🎬' },
  { clave: 'validar_candy', ruta: '/admin/validar', titulo: 'Validar QR — Candy', icono: '🍿' }
] as const;

export type ClavePermiso = typeof SECCIONES_ADMIN[number]['clave'] | 'roles';

/**
 * Permisos del usuario logueado (mail "RPP final": roles configurables).
 *  - rol base 'admin': acceso total (incluida la gestión de roles)
 *  - roles base 'empleado_cine' / 'empleado_candy': su sector del validador
 *  - rol configurable (perfiles.rol_id → roles.permisos): las secciones tildadas
 */
@Service()
export class PermisosService {
  private supabase = inject(SupabaseService).client;

  private usuarioCargado: string | null = null;
  private carga: Promise<void> | null = null;

  rolBase = signal<string | null>(null);
  nombreRol = signal<string | null>(null);
  private permisosRol = signal<Set<string>>(new Set());

  esAdmin = computed(() => this.rolBase() === 'admin');

  permisos = computed<Set<string>>(() => {
    if (this.esAdmin()) return new Set([...SECCIONES_ADMIN.map(s => s.clave), 'roles']);
    const p = new Set(this.permisosRol());
    if (this.rolBase() === 'empleado_cine') p.add('validar_sala');
    if (this.rolBase() === 'empleado_candy') p.add('validar_candy');
    return p;
  });

  tieneAccesoPanel = computed(() => this.permisos().size > 0);

  /** Secciones visibles en la barra lateral (las dos de validación van en un solo link). */
  seccionesVisibles = computed(() => {
    const p = this.permisos();
    const lista: { ruta: string; titulo: string; icono: string }[] = SECCIONES_ADMIN
      .filter(s => !s.clave.startsWith('validar_') && p.has(s.clave))
      .map(s => ({ ruta: s.ruta, titulo: s.titulo, icono: s.icono }));
    if (p.has('roles')) lista.push({ ruta: '/admin/roles', titulo: 'Roles y Permisos', icono: '🔐' });
    if (p.has('validar_sala') || p.has('validar_candy')) {
      lista.push({ ruta: '/admin/validar', titulo: 'Validar QRs / PINs', icono: '📷' });
    }
    return lista;
  });

  puede(clave: ClavePermiso): boolean {
    return this.permisos().has(clave);
  }

  /** Primera sección permitida (a dónde mandar a alguien que entra a una que no puede ver). */
  primeraRuta(): string | null {
    return this.seccionesVisibles()[0]?.ruta ?? null;
  }

  /** Carga (una vez por usuario) el rol base y el rol configurable. */
  async cargarPara(userId: string | null, forzar = false): Promise<void> {
    if (!userId) {
      this.usuarioCargado = null;
      this.rolBase.set(null);
      this.nombreRol.set(null);
      this.permisosRol.set(new Set());
      return;
    }
    if (!forzar && this.usuarioCargado === userId && this.carga) return this.carga;

    this.usuarioCargado = userId;
    this.carga = (async () => {
      const { data, error } = await this.supabase
        .from('perfiles')
        .select('rol, roles ( nombre, permisos )')
        .eq('id', userId)
        .single();
      if (error) {
        console.error('No se pudieron cargar los permisos:', error);
        return;
      }
      const rolConfig = data.roles as unknown as { nombre: string; permisos: string[] } | null;
      this.rolBase.set(data.rol);
      this.nombreRol.set(rolConfig?.nombre ?? null);
      this.permisosRol.set(new Set(rolConfig?.permisos ?? []));
    })();
    return this.carga;
  }
}
