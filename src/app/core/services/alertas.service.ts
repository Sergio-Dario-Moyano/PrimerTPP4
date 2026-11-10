import { Service, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth.service';
import { ventaAbierta } from '../utils/precios';
import { RawPelicula } from '../models/RawPelicula.model';

export interface AvisoEstreno { pelicula_id: string; titulo: string; url_imagen: string; }

/**
 * Sección "Próximamente" y alertas de estreno (mail 08/03):
 * el usuario activa una alerta y, cuando abre la venta de entradas
 * (preventa o estreno), recibe una notificación.
 */
@Service()
export class AlertasService {
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);

  /** Avisos pendientes del usuario logueado (los muestra la campanita del navbar). */
  avisos = signal<AvisoEstreno[]>([]);

  async getProximamente(): Promise<RawPelicula[]> {
    const { data, error } = await this.supabase
      .from('peliculas')
      .select('*, pelicula_genero ( generos ( nombre ) )')
      .eq('estado', 'proximamente')
      .order('fecha_estreno', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as RawPelicula[];
  }

  async misAlertas(): Promise<Set<string>> {
    const user = this.auth.usuarioActual();
    if (!user) return new Set();
    const { data } = await this.supabase.from('alertas_estrenos').select('pelicula_id').eq('perfil_id', user.id);
    return new Set((data ?? []).map(a => a.pelicula_id as string));
  }

  async activar(peliculaId: string): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) throw new Error('Iniciá sesión para activar alertas.');
    const { error } = await this.supabase.from('alertas_estrenos')
      .upsert({ perfil_id: user.id, pelicula_id: peliculaId, notificado: false });
    if (error) throw error;
    // Pedimos permiso para notificaciones del navegador (opcional)
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  async desactivar(peliculaId: string): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) return;
    await this.supabase.from('alertas_estrenos').delete().eq('perfil_id', user.id).eq('pelicula_id', peliculaId);
  }

  /** Busca alertas no notificadas cuya película ya tiene la venta abierta. */
  async revisarAvisos(): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) { this.avisos.set([]); return; }

    const { data } = await this.supabase
      .from('alertas_estrenos')
      .select('pelicula_id, peliculas ( titulo, url_imagen, estado, fecha_estreno, preventa_inicio, preventa_precio, precio_base )')
      .eq('perfil_id', user.id)
      .eq('notificado', false);

    type Fila = { pelicula_id: string; peliculas: RawPelicula | null };
    const disponibles = ((data ?? []) as unknown as Fila[])
      .filter(a => a.peliculas && ventaAbierta(a.peliculas))
      .map(a => ({ pelicula_id: a.pelicula_id, titulo: a.peliculas!.titulo, url_imagen: a.peliculas!.url_imagen }));

    // Notificación del navegador para los avisos nuevos
    const yaMostrados = new Set(this.avisos().map(a => a.pelicula_id));
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const a of disponibles.filter(d => !yaMostrados.has(d.pelicula_id))) {
        new Notification('¡Entradas disponibles!', { body: `Ya podés comprar entradas para "${a.titulo}"`, icon: a.url_imagen });
      }
    }
    this.avisos.set(disponibles);
  }

  async marcarLeido(peliculaId: string): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) return;
    await this.supabase.from('alertas_estrenos').update({ notificado: true })
      .eq('perfil_id', user.id).eq('pelicula_id', peliculaId);
    this.avisos.update(lista => lista.filter(a => a.pelicula_id !== peliculaId));
  }
}
