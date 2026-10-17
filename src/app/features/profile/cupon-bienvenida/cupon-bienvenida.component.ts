import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-cupon-bienvenida',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cupon-bienvenida.component.html',
  styleUrls: ['./cupon-bienvenida.component.css']
})
export class CuponBienvenidaComponent implements OnInit {
  private supabase = inject(SupabaseService).client;

  cargando = signal<boolean>(true);
  cuponesDisponibles = signal<any[]>([]);

  async ngOnInit() {
    await this.cargarCuponesUsuario();
  }

  async cargarCuponesUsuario() {
    try {
      this.cargando.set(true);

      // 1. Obtener el usuario actual y su fecha de nacimiento para validar la regla de los mayores de 50 años
      const { data: authData } = await this.supabase.auth.getUser();
      const userId = authData?.user?.id;

      let esMayorDe50 = false;

      if (userId) {
        const { data: perfil } = await this.supabase
          .from('perfiles')
          .select('fecha_nacimiento')
          .eq('id', userId)
          .single();

        if (perfil && perfil.fecha_nacimiento) {
          const fnac = new Date(perfil.fecha_nacimiento);
          const hoy = new Date();
          let edad = hoy.getFullYear() - fnac.getFullYear();
          const m = hoy.getMonth() - fnac.getMonth();
          if (m < 0 || (m === 0 && hoy.getDate() < fnac.getDate())) {
            edad--;
          }
          esMayorDe50 = edad >= 50;
        }
      }

      // 2. Consultar todos los cupones activos en la base de datos
      const { data: cupones, error } = await this.supabase
        .from('cupones')
        .select('*')
        .eq('activo', true);

      if (error) throw error;

      // 3. Filtrar según la regla de negocio (si el cupón es solo para mayores de 50, validamos la edad del usuario)
      const cuponesValidos = (cupones || []).filter(c => {
        if (c.solo_mayores_50) {
          return esMayorDe50;
        }
        return true;
      });

      this.cuponesDisponibles.set(cuponesValidos);

    } catch (err) {
      console.error('Error cargando cupones para el perfil:', err);
    } finally {
      this.cargando.set(false);
    }
  }
}
