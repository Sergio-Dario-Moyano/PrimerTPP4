import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase';

export const authGuard: CanActivateFn = async (route, state) => {
  const supabase = inject(SupabaseService).client;
  const router = inject(Router);

  // Verificamos la sesión actual en Supabase
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    return true; // Hay sesión, permite el acceso
  }

  // Redirigimos al componente de Login ya configurado en las rutas
  return router.createUrlTree(['/login']);
};
