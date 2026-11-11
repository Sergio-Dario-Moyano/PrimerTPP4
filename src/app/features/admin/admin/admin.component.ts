import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';
import { PermisosService } from '../../../core/services/permisos.service';
import { ModalService } from '../../../core/services/modal.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);
  private modalService = inject(ModalService);

  nombreUsuario = signal<string>('Administrador');
  emailUsuario = signal<string>('');
  inicial = signal<string>('A');
  /** Secciones según los permisos del usuario (admin, empleados o rol configurable). */
  private permisos = inject(PermisosService);
  secciones = this.permisos.seccionesVisibles;
  nombreRol = computed(() => this.permisos.nombreRol() ?? this.permisos.rolBase() ?? '');

  async ngOnInit() {
    try {
      const { data: authData } = await this.supabase.auth.getUser();
      const user = authData?.user;

      if (user) {
        this.emailUsuario.set(user.email || '');
        const { data: perfil } = await this.supabase
          .from('perfiles')
          .select('nombre, apellido')
          .eq('id', user.id)
          .single();

        if (perfil && perfil.nombre) {
          const nombreCompleto = `${perfil.nombre} ${perfil.apellido || ''}`.trim();
          this.nombreUsuario.set(nombreCompleto);
          this.inicial.set(perfil.nombre.charAt(0).toUpperCase());
        } else {
          this.nombreUsuario.set(user.email?.split('@')[0] || 'Admin');
          this.inicial.set((user.email?.charAt(0) || 'A').toUpperCase());
        }
      }
    } catch (err) {
      console.error('Error cargando datos del admin:', err);
    }
  }

  async cerrarSesion() {
    if (!(await this.modalService.confirmar('Cerrar sesión', '¿Deseás cerrar sesión?', 'Cerrar sesión'))) return;
    await this.supabase.auth.signOut();
    this.router.navigate(['/home']);
  }
}
