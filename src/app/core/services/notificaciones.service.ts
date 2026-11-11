import { Service, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase';
import { environment } from './environments/environment';

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  link: string | null;
  leida: boolean;
  creado_en: string;
}

/**
 * Notificaciones del usuario (tabla notificaciones).
 * Las crea la base de datos: lista de espera, función cancelada, propuestas, créditos.
 *  - Campanita del navbar: se cargan y se escuchan en tiempo real (Supabase Realtime).
 *  - Notificación del sistema: si dio permiso, se muestra aunque la pestaña esté en segundo plano.
 *  - Web Push: con la app CERRADA, la manda la Edge Function "enviar-push".
 */
@Service()
export class NotificacionesService {
  private supabase = inject(SupabaseService).client;
  private swPush = inject(SwPush);
  private router = inject(Router);

  private canal: RealtimeChannel | null = null;
  private usuarioId: string | null = null;

  notificaciones = signal<Notificacion[]>([]);
  noLeidas = computed(() => this.notificaciones().filter(n => !n.leida).length);
  permisoNotificaciones = signal<NotificationPermission>('Notification' in window ? Notification.permission : 'denied');
  pushActivo = signal<boolean>(false);

  constructor() {
    // Clic en una notificación push (app instalada / en segundo plano)
    if (this.swPush.isEnabled) {
      this.swPush.notificationClicks.subscribe(({ notification }) => {
        const url = (notification.data as { url?: string } | undefined)?.url;
        if (url) this.router.navigateByUrl(url);
      });
      this.swPush.subscription.subscribe(sub => this.pushActivo.set(!!sub));
    }
  }

  async iniciar(usuarioId: string | null): Promise<void> {
    if (usuarioId === this.usuarioId) return;
    this.detener();
    this.usuarioId = usuarioId;
    if (!usuarioId) return;

    // Créditos de compras anónimas en funciones canceladas, hechas con este email
    await this.supabase.rpc('reclamar_creditos');

    await this.cargar();

    this.canal = this.supabase
      .channel(`notificaciones-${usuarioId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `perfil_id=eq.${usuarioId}` },
        payload => {
          const nueva = payload.new as Notificacion;
          this.notificaciones.update(lista => [nueva, ...lista].slice(0, 30));
          this.mostrarDelSistema(nueva);
        })
      .subscribe();
  }

  detener(): void {
    if (this.canal) this.supabase.removeChannel(this.canal);
    this.canal = null;
    this.usuarioId = null;
    this.notificaciones.set([]);
  }

  async cargar(): Promise<void> {
    if (!this.usuarioId) return;
    const { data } = await this.supabase
      .from('notificaciones')
      .select('*')
      .eq('perfil_id', this.usuarioId)
      .order('creado_en', { ascending: false })
      .limit(30);
    this.notificaciones.set((data ?? []) as Notificacion[]);
  }

  async marcarLeida(n: Notificacion): Promise<void> {
    if (n.leida) return;
    await this.supabase.from('notificaciones').update({ leida: true }).eq('id', n.id);
    this.notificaciones.update(lista => lista.map(x => x.id === n.id ? { ...x, leida: true } : x));
  }

  async marcarTodasLeidas(): Promise<void> {
    if (!this.usuarioId) return;
    await this.supabase.from('notificaciones').update({ leida: true }).eq('perfil_id', this.usuarioId).eq('leida', false);
    this.notificaciones.update(lista => lista.map(x => ({ ...x, leida: true })));
  }

  /**
   * Pide permiso y registra este dispositivo para Web Push.
   * Tiene que llamarse desde un clic del usuario (lo exige el navegador).
   */
  async activarPush(): Promise<string> {
    if (!('Notification' in window)) return 'Este navegador no soporta notificaciones.';

    const permiso = await Notification.requestPermission();
    this.permisoNotificaciones.set(permiso);
    if (permiso !== 'granted') return 'No diste permiso para mostrar notificaciones.';

    // Sin service worker (ng serve) o sin clave VAPID: quedan las notificaciones con la app abierta
    if (!this.swPush.isEnabled || !environment.vapidPublicKey) {
      return 'Notificaciones activadas mientras la app esté abierta.';
    }

    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey });
      const json = sub.toJSON();
      await this.supabase.from('push_suscripciones').upsert(
        { perfil_id: this.usuarioId, endpoint: json.endpoint, suscripcion: json },
        { onConflict: 'endpoint' });
      return 'Listo: vas a recibir notificaciones aunque la app esté cerrada.';
    } catch (err) {
      console.error('Error al suscribirse a push:', err);
      return 'No se pudo activar el push; las notificaciones funcionan con la app abierta.';
    }
  }

  /** Notificación del sistema operativo mientras la app está abierta o en segundo plano. */
  private async mostrarDelSistema(n: Notificacion): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Si ya hay push activo, la Edge Function manda la suya: evitamos el duplicado
    if (this.pushActivo()) return;

    const opciones: NotificationOptions = {
      body: n.mensaje,
      icon: 'icons/icon-192x192.png',
      badge: 'icons/icon-72x72.png',
      tag: n.id,
      data: { url: n.link }
    };
    const registro = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registro) registro.showNotification(n.titulo, opciones);
    else new Notification(n.titulo, opciones);
  }
}
