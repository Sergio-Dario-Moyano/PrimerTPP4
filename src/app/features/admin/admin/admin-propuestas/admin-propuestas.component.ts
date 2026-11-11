import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';

export interface PropuestaAdmin {
  id: string;
  titulo: string;
  descripcion: string;
  motivo: string;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  respuesta: string | null;
  pelicula_id: string | null;
  creado_en: string;
  perfil_id: string;
  perfiles: { nombre: string; apellido: string; email: string | null } | null;
}

type Filtro = 'pendiente' | 'aceptada' | 'rechazada' | 'todas';

/**
 * Propuestas de los clientes (mail "RPP final").
 * Aceptar → abre "Películas" con el formulario precargado; la propuesta queda
 * aceptada recién cuando se crea la película. Rechazar → se avisa al cliente.
 */
@Component({
  selector: 'app-admin-propuestas',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-propuestas.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminPropuestasComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private router = inject(Router);
  private log = inject(LogService);

  propuestas = signal<PropuestaAdmin[]>([]);
  filtro = signal<Filtro>('pendiente');
  rechazando = signal<string | null>(null);
  respuesta = signal<string>('');
  mensaje = signal<string>('');

  filtradas = computed(() => {
    const f = this.filtro();
    return f === 'todas' ? this.propuestas() : this.propuestas().filter(p => p.estado === f);
  });

  contador = computed(() => ({
    pendiente: this.propuestas().filter(p => p.estado === 'pendiente').length,
    aceptada: this.propuestas().filter(p => p.estado === 'aceptada').length,
    rechazada: this.propuestas().filter(p => p.estado === 'rechazada').length
  }));

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    const { data, error } = await this.supabase
      .from('propuestas')
      .select('*, perfiles!propuestas_perfil_id_fkey ( nombre, apellido, email )')
      .order('creado_en', { ascending: false });
    if (error) { console.error(error); this.mensaje.set(error.message); return; }
    this.propuestas.set((data ?? []) as unknown as PropuestaAdmin[]);
  }

  autor(p: PropuestaAdmin): string {
    return p.perfiles ? `${p.perfiles.nombre} ${p.perfiles.apellido}`.trim() : 'Usuario';
  }

  /** Lleva al alta de película con título y sinopsis de la propuesta. */
  aceptar(p: PropuestaAdmin): void {
    this.router.navigate(['/admin/peliculas'], { queryParams: { propuesta: p.id } });
  }

  iniciarRechazo(p: PropuestaAdmin): void {
    this.rechazando.set(p.id);
    this.respuesta.set('');
  }

  async confirmarRechazo(p: PropuestaAdmin): Promise<void> {
    const { data: auth } = await this.supabase.auth.getUser();
    const respuesta = this.respuesta().trim() || 'Por ahora no vamos a incorporarla a la cartelera.';

    const { error } = await this.supabase.from('propuestas').update({
      estado: 'rechazada', respuesta, revisado_por: auth?.user?.id ?? null, revisado_en: new Date().toISOString()
    }).eq('id', p.id).eq('estado', 'pendiente');
    if (error) { this.mensaje.set(error.message); return; }

    await this.supabase.from('notificaciones').insert({
      perfil_id: p.perfil_id,
      tipo: 'propuesta',
      titulo: 'Revisamos tu propuesta',
      mensaje: `"${p.titulo}" no fue aceptada. ${respuesta}`,
      link: '/perfil/propuesta'
    });
    await this.log.registrar('RECHAZAR_PROPUESTA', 'propuestas', p.id, `Se rechazó la propuesta "${p.titulo}" de ${this.autor(p)}`);

    this.rechazando.set(null);
    this.mensaje.set(`Propuesta "${p.titulo}" rechazada. Se le avisó al cliente.`);
    await this.cargar();
  }
}
