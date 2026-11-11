import { Component, inject, signal, effect, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AlertasService } from '../../../core/services/alertas.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { NotificacionesService, Notificacion } from '../../../core/services/notificaciones.service';
import { ModalService } from '../../../core/services/modal.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  private alertasService = inject(AlertasService);
  private modalService = inject(ModalService);

  // Avisos de estreno (campanita)
  avisos = this.alertasService.avisos;
  avisosAbiertos = signal<boolean>(false);

  usuarioActual = this.authService.usuarioActual;
  menuAbierto = signal<boolean>(false);

  // Acceso al panel según permisos (admin, empleados o rol configurable)
  private permisos = inject(PermisosService);
  private notificacionesService = inject(NotificacionesService);
  notificaciones = this.notificacionesService.notificaciones;
  noLeidas = this.notificacionesService.noLeidas;
  permisoNotificaciones = this.notificacionesService.permisoNotificaciones;
  mensajePush = signal<string>('');

  /** Solo valida QRs (empleados): acceso directo al validador. */
  soloValidador = computed(() => {
    const secciones = this.permisos.seccionesVisibles();
    return secciones.length === 1 && secciones[0].ruta === '/admin/validar';
  });
  tienePanel = computed(() => this.permisos.tieneAccesoPanel() && !this.soloValidador());
  totalAvisos = computed(() => this.avisos().length + this.noLeidas());

  constructor() {
    effect(() => {
      const usuario = this.usuarioActual();
      const id = usuario?.id ?? null;
      this.permisos.cargarPara(id);
      this.notificacionesService.iniciar(id);
      // Revisamos si alguna película con alerta ya abrió la venta
      if (id) this.alertasService.revisarAvisos();
    });
  }

  toggleAvisos() {
    this.avisosAbiertos.update(v => !v);
  }

  async abrirNotificacion(n: Notificacion) {
    await this.notificacionesService.marcarLeida(n);
    this.avisosAbiertos.set(false);
    this.cerrarMenu();
    if (n.link) this.router.navigateByUrl(n.link);
  }

  marcarTodasLeidas() {
    this.notificacionesService.marcarTodasLeidas();
  }

  async activarPush() {
    this.mensajePush.set(await this.notificacionesService.activarPush());
  }

  async abrirAviso(peliculaId: string) {
    await this.alertasService.marcarLeido(peliculaId);
    this.avisosAbiertos.set(false);
    this.cerrarMenu();
    this.router.navigate(['/pelicula', peliculaId]);
  }

  toggleMenu() {
    this.menuAbierto.update(estado => !estado);
  }

  cerrarMenu() {
    this.menuAbierto.set(false);
  }

  async cerrarSesion() {
    this.cerrarMenu();
    if (!(await this.modalService.confirmar('Cerrar sesión', '¿Deseás cerrar sesión?', 'Cerrar sesión'))) return;
    try {
      await this.authService.cerrarSesion();
      this.cerrarMenu();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error cerrando sesión:', error);
    }
  }
}
