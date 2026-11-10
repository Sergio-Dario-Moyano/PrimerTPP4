import { Component, inject, signal, effect } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase';
import { AlertasService } from '../../../core/services/alertas.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  private alertasService = inject(AlertasService);

  // Avisos de estreno (campanita)
  avisos = this.alertasService.avisos;
  avisosAbiertos = signal<boolean>(false);

  usuarioActual = this.authService.usuarioActual;
  menuAbierto = signal<boolean>(false);

  // Signal para controlar si el usuario logueado es admin
  esAdmin = signal<boolean>(false);
  // Empleados de cine / candy: ven el acceso directo al validador
  esEmpleado = signal<boolean>(false);

  constructor() {
    // Cada vez que cambie el usuario actual, consultamos su rol en la tabla 'perfiles' de Supabase
    effect(async () => {
      const usuario = this.usuarioActual();
      if (!usuario) {
        this.esAdmin.set(false);
        this.esEmpleado.set(false);
        return;
      }

      // Revisamos si alguna película con alerta ya abrió la venta
      this.alertasService.revisarAvisos();

      try {
        const { data: perfil, error } = await this.supabase
          .from('perfiles')
          .select('rol')
          .eq('id', usuario.id)
          .single();

        if (error) throw error;

        // Evaluamos si el rol coincide con 'admin' (igual que tu admin-guard)
        this.esAdmin.set(perfil?.rol === 'admin');
        this.esEmpleado.set(perfil?.rol === 'empleado_cine' || perfil?.rol === 'empleado_candy');
      } catch (error) {
        console.error('Error al verificar rol de admin en Navbar:', error);
        this.esAdmin.set(false);
      }
    });
  }

  toggleAvisos() {
    this.avisosAbiertos.update(v => !v);
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
    try {
      await this.authService.cerrarSesion();
      this.cerrarMenu();
      this.esAdmin.set(false); // Reseteamos el estado de admin al salir
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error cerrando sesión:', error);
    }
  }
}
