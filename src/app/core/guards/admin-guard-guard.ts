import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase';

export const adminGuard: CanActivateFn = async (route, state) => {
  const supabase = inject(SupabaseService).client;
  const router = inject(Router);

  //Verificar si hay sesión activa
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    return router.createUrlTree(['/login']); // Redirigir al login si no está logueado
  }

  //Verificar el rol en la tabla pública de perfiles
  try {
    const { data: perfil, error } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('id', sessionData.session.user.id)
      .single();

    if (error) throw error;

    if (perfil && perfil.rol === 'admin') {
      return true; // Es admin, permito el acceso
    }
  } catch (error) {
    console.error('Error verificando rol de admin:', error);
  }

  // Si no es admin o hubo un error, se lo expulsa a la cartelera
  return router.createUrlTree(['/home']);
};
