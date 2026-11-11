import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, Router, RouterOutlet, RouterLinkActive } from '@angular/router';
import { User } from '@supabase/supabase-js';

import { SupabaseService } from '../../core/services/supabase';
import { AuthService } from '../../core/services/auth.service';
import { ModalService } from '../../core/services/modal.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [RouterLink, RouterOutlet, RouterLinkActive],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  private supabaseService = inject(SupabaseService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private modalService = inject(ModalService);

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);

  usuario = signal<User | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const { data: authData, error: authError } = await this.supabaseService.client.auth.getUser();

      if (authError || !authData.user) {
        this.router.navigate(['/login']);
        return;
      }

      this.usuario.set(authData.user);
    } catch (err) {

      const msg = err instanceof Error ? err.message : 'Error desconocido al cargar el perfil';
      this.error.set('Hubo un problema al cargar el perfil: ' + msg);
    } finally {
      this.cargando.set(false);
    }
  }

  async cerrarSesion(): Promise<void> {
    if (!(await this.modalService.confirmar('Cerrar sesión', '¿Deseás cerrar sesión?', 'Cerrar sesión'))) return;
    try {
      await this.authService.cerrarSesion();
      this.router.navigate(['/']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }
}
