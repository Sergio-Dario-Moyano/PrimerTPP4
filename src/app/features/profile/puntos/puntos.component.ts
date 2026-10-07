import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SupabaseService } from '../../../core/services/supabase';

@Component({
  selector: 'app-puntos',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './puntos.component.html',
  styleUrls: ['./puntos.component.css']
})
export class PuntosComponent implements OnInit {
  private supabaseService = inject(SupabaseService);

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);
  puntosAcumulados = signal<number>(0);

  async ngOnInit(): Promise<void> {
    try {
      const supabase = this.supabaseService.client;
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error('Usuario no autenticado');
      }

      // Leemos directamente el total cacheado en el perfil
      const { data: perfilData, error: perfilError } = await supabase
        .from('perfiles')
        .select('puntos_fidelizacion')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (perfilError) throw perfilError;

      this.puntosAcumulados.set(perfilData?.puntos_fidelizacion || 0);

    } catch (err) {
      this.error.set('No pudimos cargar tus puntos. Intenta de nuevo más tarde.');
      console.error('Error cargando puntos:', err);
    } finally {
      this.cargando.set(false);
    }
  }
}
