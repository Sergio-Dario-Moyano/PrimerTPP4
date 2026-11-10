import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AlertasService } from '../../../core/services/alertas.service';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { enPreventa, ventaAbierta } from '../../../core/utils/precios';
import { desdeBD } from '../../../shared/utils/fechas';

interface PeliculaProxima {
  id: string;
  titulo: string;
  sinopsis: string;
  poster: string;
  generos: string[];
  estreno: Date | null;
  clasificacion: string;
  enPreventa: boolean;
  ventaAbierta: boolean;
  precioPreventa: number | null;
}

/** Sección "Próximamente" (mail 08/03) con alertas de estreno y preventa. */
@Component({
  selector: 'app-proximamente',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './proximamente.component.html',
  styleUrl: './proximamente.component.css'
})
export class ProximamenteComponent implements OnInit {
  private alertas = inject(AlertasService);
  private auth = inject(AuthService);
  private modal = inject(ModalService);
  private router = inject(Router);

  peliculas = signal<PeliculaProxima[]>([]);
  conAlerta = signal<Set<string>>(new Set());
  cargando = signal<boolean>(true);
  procesando = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const [pelis, alertas] = await Promise.all([this.alertas.getProximamente(), this.alertas.misAlertas()]);
      this.peliculas.set(pelis.map(p => this.mapear(p)));
      this.conAlerta.set(alertas);
    } catch (err) {
      console.error(err);
    } finally {
      this.cargando.set(false);
    }
  }

  private mapear(p: RawPelicula): PeliculaProxima {
    return {
      id: p.id,
      titulo: p.titulo,
      sinopsis: p.sinopsis,
      poster: p.url_imagen,
      generos: (p.pelicula_genero ?? []).map(g => g.generos?.nombre).filter(Boolean),
      estreno: desdeBD(p.fecha_estreno ?? null),
      clasificacion: p.restriccion_edad ? `+${p.restriccion_edad}` : 'ATP',
      enPreventa: enPreventa(p),
      ventaAbierta: ventaAbierta(p),
      precioPreventa: p.preventa_precio
    };
  }

  async toggleAlerta(p: PeliculaProxima): Promise<void> {
    if (!this.auth.usuarioActual()) {
      this.modal.open('Iniciá sesión', 'Para recibir avisos de estreno necesitás una cuenta.', 'info');
      this.router.navigate(['/login']);
      return;
    }

    this.procesando.set(p.id);
    try {
      const set = new Set(this.conAlerta());
      if (set.has(p.id)) {
        await this.alertas.desactivar(p.id);
        set.delete(p.id);
      } else {
        await this.alertas.activar(p.id);
        set.add(p.id);
        this.modal.open('Alerta activada', `Te avisamos cuando salgan a la venta las entradas de "${p.titulo}".`, 'success');
      }
      this.conAlerta.set(set);
    } catch (err) {
      this.modal.open('Error', err instanceof Error ? err.message : 'No se pudo guardar la alerta.', 'error');
    } finally {
      this.procesando.set(null);
    }
  }
}
