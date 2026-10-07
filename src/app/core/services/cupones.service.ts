import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';

@Service()
export class CuponesService {

  private supabase = inject(SupabaseService).client;

  async verificarCuponBienvenida(perfilId: string) {
    // Buscamos el cupón de bienvenida activo
    const { data: cupon, error: errorCupon } = await this.supabase
      .from('cupones')
      .select('*')
      .eq('codigo', 'BIENVENIDA')
      .eq('activo', true)
      .maybeSingle();

    if (errorCupon || !cupon) {
      return null;
    }

    // Verificamos si este perfil ya lo usó en la tabla compras
    const { data: compra, error: errorCompra } = await this.supabase
      .from('compras')
      .select('id')
      .eq('perfil_id', perfilId)
      .eq('cupon_id', cupon.id)
      .limit(1);

    if (compra && compra.length > 0) {
      console.warn('Detenido: El usuario ya tiene una compra con este cupón.');
      return null; // Ya lo usó
    }

    return cupon; // Está activo y no lo usó
  }
}
