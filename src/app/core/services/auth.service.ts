import { Service, inject, signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase';
import { Usuario } from '../models/Usuario.model';

@Service()
export class AuthService {
  private supabase = inject(SupabaseService).client;

  public usuarioActual = signal<User | null>(null);

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.usuarioActual.set(session?.user || null);
    });
  }

  async registrarUsuario(email: string, password: string, datosPersonales: Usuario) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre: datosPersonales.nombre,
          apellido: datosPersonales.apellido,
          fecha_nacimiento: datosPersonales.fecha_nacimiento,
          tipo_sangre: datosPersonales.tipo_sangre,
          color_ojos: datosPersonales.color_ojos,
          dias_vacaciones: datosPersonales.dias_vacaciones
        }
      }
    });

    if (error) throw error;
    // Supabase no devuelve error si el correo ya existe: devuelve un usuario sin identidades
    if (data.user && data.user.identities?.length === 0) throw new Error('EMAIL_YA_REGISTRADO');
    return data;
  }


  async iniciarSesion(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  }

  async cerrarSesion() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }
}
