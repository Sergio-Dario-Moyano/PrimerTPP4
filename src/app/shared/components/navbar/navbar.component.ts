import { Component, inject, signal, effect } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase'; // Ajusta la ruta si es necesario

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

  usuarioActual = this.authService.usuarioActual;
  menuAbierto = signal<boolean>(false);

  // Signal para controlar si el usuario logueado es admin
  esAdmin = signal<boolean>(false);

  constructor() {
    // Cada vez que cambie el usuario actual, consultamos su rol en la tabla 'perfiles' de Supabase
    effect(async () => {
      const usuario = this.usuarioActual();
      if (!usuario) {
        this.esAdmin.set(false);
        return;
      }

      try {
        const { data: perfil, error } = await this.supabase
          .from('perfiles')
          .select('rol')
          .eq('id', usuario.id)
          .single();

        if (error) throw error;

        // Evaluamos si el rol coincide con 'admin' (igual que tu admin-guard)
        this.esAdmin.set(perfil?.rol === 'admin');
      } catch (error) {
        console.error('Error al verificar rol de admin en Navbar:', error);
        this.esAdmin.set(false);
      }
    });
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
