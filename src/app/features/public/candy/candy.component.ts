import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ResumenCompraComponent } from '../../../shared/components/resumen-compra/resumen-compra.component';
import { SupabaseService } from '../../../core/services/supabase';
import { ReservaService } from '../../../core/services/reserva.service';
import { PeliculaService } from '../../../core/services/pelicula.service';
import { Pelicula } from '../../../core/models/Pelicula.model';
import { ButacaReservada } from '../../../core/models/ButacaReservada.model';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { RawComboCandy } from '../../../core/models/RawComboCandy.model';
import { ProductoCandy } from '../../../core/models/ProductoCandy.model';

@Component({
  selector: 'app-candy',
  standalone: true,
  imports: [DecimalPipe, DatePipe, ResumenCompraComponent],
  templateUrl: './candy.component.html',
  styleUrl: './candy.component.css'
})
export class CandyComponent implements OnInit {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  private reservaService = inject(ReservaService);
  private peliculaService = inject(PeliculaService);

  pelicula = signal<Pelicula | null>(null);
  horarioSeleccionado = signal<string>('');
  salaSeleccionada = signal<string>('');
  butacasReservadas = signal<ButacaReservada[]>([]);
  carrito = signal<Record<string, number>>({});
  productos = signal<ProductoCandy[]>([]);

  totalCarrito = computed(() => {
    const items = this.carrito();
    let total = 0;
    for (const [id, cantidad] of Object.entries(items)) {
      const producto = this.productos().find(p => p.id === id);
      if (producto) total += producto.precio * cantidad;
    }
    return total;
  });

  resumenCandy = computed(() => {
    const items = this.carrito();
    const resumen = [];
    for (const [id, cantidad] of Object.entries(items)) {
      const producto = this.productos().find(p => p.id === id);
      if (producto) {
        resumen.push({
          cantidad: cantidad,
          nombre: producto.nombre,
          precioTotal: producto.precio * cantidad,
          imagenUrl: producto.imagenUrl
        });
      }
    }
    return resumen;
  });

  nombresButacas = computed(() => this.butacasReservadas().map(b => `${b.fila}${b.columna}`));

  resumenEntradas = computed(() => {
    const cantidad = this.butacasReservadas().length;
    if (cantidad === 0) return [];
    return [{
      cantidad: cantidad,
      tipo: 'Entrada General',
      precioTotal: cantidad * 5000
    }];
  });

  cargoServicioEntradas = computed(() => this.butacasReservadas().length > 0 ? 1050 : 0);
  cargoServicioCandy = computed(() => Object.keys(this.carrito()).length > 0 ? 900 : 0);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this.cargarPelicula(id);
    });

    this.route.queryParamMap.subscribe(params => {
      const horario = params.get('horario');
      const sala = params.get('sala');
      if (horario) this.horarioSeleccionado.set(horario);
      if (sala) this.salaSeleccionada.set(sala);
    });

    this.butacasReservadas.set(this.reservaService.butacas());
    this.cargarCandy();
  }

  async cargarPelicula(id: string): Promise<void> {
    try {
      const data: RawPelicula = await this.peliculaService.getPeliculaById(id);

      const generosMapeados = data.pelicula_genero && data.pelicula_genero.length > 0
        ? data.pelicula_genero.map((rel: any) => rel.generos?.nombre || 'Sin género')
        : ['Sin género'];

      const clasificacion = data.restriccion_edad === 0 ? 'ATP' : `+${data.restriccion_edad}`;

      this.pelicula.set({
        id: String(data.id),
        titulo: data.titulo,
        sinopsis: data.sinopsis,
        duracion: Number(data.duracion_minutos),
        poster_url: data.url_imagen,
        clasificacion: clasificacion,
        generos: generosMapeados,
        formatos: ['2D', '3D'],
        idiomas: ['Castellano'],
        hero_imagen: data.hero_imagen
      });

    } catch (error) {
      console.error('Error cargando película:', error);
    }
  }

  async cargarCandy(): Promise<void> {
    try {
      const supabase = this.supabaseService.client;
      const { data, error } = await supabase
        .from('combos_candy')
        .select('*')
        .eq('activo', true);

      if (error) throw error;

      if (data) {
        const productosDB: ProductoCandy[] = data.map((item: RawComboCandy) => ({
          id: String(item.id),
          nombre: item.nombre,
          descripcion: item.descripcion,
          precio: Number(item.precio),
          precioSinImpuestos: Math.round(Number(item.precio) / 1.21),
          // 💡 Manejo de URL nula por si el seed de la BD no tiene imagen
          imagenUrl: item.imagen_url || 'https://via.placeholder.com/400x300/cbd4df/64748b?text=Combo',
          enOferta: item.en_oferta || false
        }));
        this.productos.set(productosDB);
      }
    } catch (error) {
      console.error('Error cargando el candy:', error);
    }
  }

  getCantidad(id: string): number {
    return this.carrito()[id] || 0;
  }

  incrementar(id: string): void {
    this.carrito.update(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }

  decrementar(id: string): void {
    this.carrito.update(prev => {
      const actual = prev[id] || 0;
      if (actual <= 1) {
        const nuevoCarrito = { ...prev };
        delete nuevoCarrito[id];
        return nuevoCarrito;
      }
      return { ...prev, [id]: actual - 1 };
    });
  }

  irAlPago(): void {
    const combosParaServicio = Object.entries(this.carrito()).map(([id, cantidad]) => {
      const producto = this.productos().find(p => p.id === id);
      return {
        id: id,
        nombre: producto?.nombre || '',
        cantidad: cantidad,
        precioUnitario: producto?.precio || 0
      };
    });

    this.reservaService.combos.set(combosParaServicio);
    this.router.navigate(['/checkout']);
  }
}
