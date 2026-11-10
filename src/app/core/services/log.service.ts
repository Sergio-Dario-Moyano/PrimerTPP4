import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';

/**
 * Log de actividad del panel de administración (mail 10/03):
 * quién hizo qué y cuándo. La fecha la pone la BD (default now()).
 */
@Service()
export class LogService {
  private supabase = inject(SupabaseService).client;

  async registrar(accion: string, entidad: string, entidadId: string | null, detalle: string): Promise<void> {
    const { data } = await this.supabase.auth.getUser();
    const { error } = await this.supabase.from('logs_actividad').insert([{
      perfil_id: data?.user?.id ?? null,
      accion,
      entidad_afectada: entidad,
      entidad_id: entidadId,
      detalle
    }]);
    if (error) console.error('No se pudo registrar el log:', error);
  }
}
