import { Component, inject, signal, OnInit } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase';

export interface Cupon {
  id: string;
  codigo: string;
  porcentaje_descuento: number;
  solo_mayores_50: boolean;
  activo: boolean;
}

@Component({
  selector: 'app-cupon-bienvenida',
  standalone: true,
  imports: [],
  templateUrl: './cupon-bienvenida.component.html',
  styleUrls: ['./cupon-bienvenida.component.css']
})
export class CuponBienvenidaComponent implements OnInit {
  private supabaseService = inject(SupabaseService);

  cargandoCupones = signal<boolean>(true);
  error = signal<string | null>(null);
  cuponDisponible = signal<Cupon | null>(null);

  ngOnInit(): void {
    this.verificarCuponBienvenida();
  }

  async verificarCuponBienvenida(): Promise<void> {
    this.cargandoCupones.set(true);
    this.error.set(null);
    const supabase = this.supabaseService.client;

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const usuarioActivo = authData?.user;

      if (authError || !usuarioActivo) {
        throw new Error('No hay usuario activo para validar cupones.');
      }

      // maybeSingle() evita que Supabase lance un error si el cupón no existe
      const { data: cuponData, error: cuponError } = await supabase
        .from('cupones')
        .select('*')
        .eq('codigo', 'BIENVENIDA')
        .eq('activo', true)
        .maybeSingle();

      if (cuponError || !cuponData) {
        this.cuponDisponible.set(null);
        return;
      }

      const { data: compraPrevia, error: compraError } = await supabase
        .from('compras')
        .select('id')
        .eq('perfil_id', usuarioActivo.id)
        .eq('cupon_id', cuponData.id)
        .limit(1);

      if (compraError) throw new Error('Error al validar el historial de uso.');

      if (compraPrevia && compraPrevia.length > 0) {
        this.cuponDisponible.set(null);
      } else {
        // Tipado explícito y seguro
        this.cuponDisponible.set({
          id: cuponData.id,
          codigo: cuponData.codigo,
          porcentaje_descuento: Number(cuponData.porcentaje_descuento),
          solo_mayores_50: cuponData.solo_mayores_50,
          activo: cuponData.activo
        });
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al cargar el cupón';
      console.error(msg);
      this.error.set('No pudimos verificar tus cupones en este momento.');
      this.cuponDisponible.set(null);
    } finally {
      this.cargandoCupones.set(false);
    }
  }
}
