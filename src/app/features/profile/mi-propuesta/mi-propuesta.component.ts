import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth.service';

interface Propuesta {
  id: string;
  titulo: string;
  descripcion: string;
  motivo: string;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  respuesta: string | null;
  pelicula_id: string | null;
  creado_en: string;
}

/**
 * Propuestas de películas (mail "RPP final"): el cliente sugiere una película
 * que no está en cartelera. Solo puede tener UNA propuesta pendiente a la vez
 * (lo garantiza también un índice único en la base).
 */
@Component({
  selector: 'app-mi-propuesta',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, RouterLink],
  templateUrl: './mi-propuesta.component.html',
  styleUrl: '../perfil-seccion.css'
})
export class MiPropuestaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;
  private auth = inject(AuthService);

  readonly MAX_DESCRIPCION = 500;
  readonly MAX_MOTIVO = 500;

  propuestas = signal<Propuesta[]>([]);
  cargando = signal<boolean>(true);
  enviando = signal<boolean>(false);
  error = signal<string>('');
  exito = signal<string>('');

  pendiente = computed(() => this.propuestas().find(p => p.estado === 'pendiente') ?? null);
  anteriores = computed(() => this.propuestas().filter(p => p.estado !== 'pendiente'));

  form = this.fb.nonNullable.group({
    titulo: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    descripcion: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(this.MAX_DESCRIPCION)]],
    motivo: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(this.MAX_MOTIVO)]]
  });

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    const user = this.auth.usuarioActual();
    if (!user) { this.cargando.set(false); return; }
    const { data, error } = await this.supabase
      .from('propuestas')
      .select('id, titulo, descripcion, motivo, estado, respuesta, pelicula_id, creado_en')
      .eq('perfil_id', user.id)
      .order('creado_en', { ascending: false });
    if (error) this.error.set('No se pudieron cargar tus propuestas.');
    this.propuestas.set((data ?? []) as Propuesta[]);
    this.cargando.set(false);
  }

  async enviar(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const user = this.auth.usuarioActual();
    if (!user) return;

    this.enviando.set(true);
    this.error.set('');
    const v = this.form.getRawValue();

    // ¿Ya está en cartelera o próximamente?
    const { data: existente } = await this.supabase
      .from('peliculas').select('titulo, estado').ilike('titulo', v.titulo.trim()).neq('estado', 'archivada').limit(1).maybeSingle();
    if (existente) {
      this.error.set(`"${existente.titulo}" ya está ${existente.estado === 'cartelera' ? 'en cartelera' : 'anunciada en Próximamente'}.`);
      this.enviando.set(false);
      return;
    }

    const { error } = await this.supabase.from('propuestas').insert({
      perfil_id: user.id,
      titulo: v.titulo.trim(),
      descripcion: v.descripcion.trim(),
      motivo: v.motivo.trim()
    });
    this.enviando.set(false);

    if (error) {
      this.error.set(error.code === '23505'
        ? 'Ya tenés una propuesta pendiente. Esperá a que la revisemos para enviar otra.'
        : 'No se pudo enviar la propuesta.');
      return;
    }
    this.form.reset();
    this.exito.set('¡Gracias! Recibimos tu propuesta. Te avisamos cuando la revisemos.');
    await this.cargar();
  }

  async retirar(p: Propuesta): Promise<void> {
    if (!confirm(`¿Retirar tu propuesta de "${p.titulo}"? Vas a poder enviar otra.`)) return;
    await this.supabase.from('propuestas').delete().eq('id', p.id).eq('estado', 'pendiente');
    this.exito.set('');
    await this.cargar();
  }
}
