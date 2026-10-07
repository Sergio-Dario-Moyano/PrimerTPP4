import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth.service';

@Service()
export class PerfilService {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  async getPerfilCompleto() {
    const usuario = this.authService.usuarioActual();
    if (!usuario) return null;

    const { data, error } = await this.supabase
      .from('perfiles')
      .select('*')
      .eq('id', usuario.id)
      .single();

    if (error) throw error;
    return data;
  }

  async verificarDescuentoPrimeraCompra(): Promise<boolean> {
    const usuario = this.authService.usuarioActual();
    if (!usuario) return false;

    const { data, error } = await this.supabase
      .rpc('validar_primera_compra', { usuario_id: usuario.id });

    if (error) throw error;
    return !!data;
  }
}
