import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { DecimalPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { ResumenCompraComponent } from '../../../shared/components/resumen-compra/resumen-compra.component';
import { SupabaseService } from '../../../core/services/supabase';
import { ReservaService } from '../../../core/services/reserva.service';
import { PeliculaService } from '../../../core/services/pelicula.service';
import { Pelicula } from '../../../core/models/Pelicula.model';
import { ButacaReservada } from '../../../core/models/ButacaReservada.model';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { RawComboCandy } from '../../../core/models/RawComboCandy.model';
import { RawProductoCandy } from '../../../core/models/RawProductoCandy.model';
import { ProductoCandy } from '../../../core/models/ProductoCandy.model';
import { ComboReservado } from '../../../core/models/ComboReservado.model';
import {
  resumirEntradasPorTipo, montoEntradasCubiertas
} from '../../../core/utils/precios';

interface Categoria { id: number; nombre: string; }

const IMAGEN_DEFECTO = 'https://placehold.co/400x300/1e1e1e/f5b301?text=Candy';

/**
 * Candy bar (mail 30/01 y 03/03): combos destacados (algunos incluyen la entrada)
 * y productos sueltos por categoría. Todo se retira con el mismo QR de la entrada.
 */
@Component({
  selector: 'app-candy',
  standalone: true,
  imports: [DecimalPipe, DatePipe, NgTemplateOutlet, ResumenCompraComponent],
  templateUrl: './candy.component.html',
  styleUrl: './candy.component.css'
})
export class CandyComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService).client;
  private reservaService = inject(ReservaService);
  private peliculaService = inject(PeliculaService);

  readonly IMAGEN_DEFECTO = IMAGEN_DEFECTO;

  pelicula = signal<Pelicula | null>(null);
  horarioSeleccionado = signal<string>('');
  salaSeleccionada = signal<string>('');
  butacasReservadas = signal<ButacaReservada[]>([]);

  combos = signal<ProductoCandy[]>([]);
  productos = signal<ProductoCandy[]>([]);
  categorias = signal<Categoria[]>([]);
  categoriaSeleccionada = signal<number | null>(null);

  /** Carrito: clave "combo:<id>" o "producto:<id>" → cantidad. */
  carrito = signal<Record<string, number>>({});

  /** Pestaña "Candy Bar" sola (sin película): /candy */
  soloCandy = signal<boolean>(false);

  /** En modo solo candy no se ofrecen los combos que incluyen entrada. */
  combosVisibles = computed(() =>
    this.soloCandy() ? this.combos().filter(c => !c.incluyeEntrada) : this.combos());

  productosFiltrados = computed(() => {
    const cat = this.categoriaSeleccionada();
    return cat == null ? this.productos() : this.productos().filter(p => p.categoriaId === cat);
  });

  private todos = computed(() => [...this.combos(), ...this.productos()]);

  itemsCarrito = computed<ComboReservado[]>(() =>
    Object.entries(this.carrito()).flatMap(([clave, cantidad]) => {
      const item = this.todos().find(p => this.clave(p) === clave);
      return item ? [{
        id: item.id, tipo: item.tipo, nombre: item.nombre, cantidad,
        precioUnitario: item.precio, incluyeEntrada: item.incluyeEntrada
      }] : [];
    })
  );

  resumenCandy = computed(() =>
    this.itemsCarrito().map(i => ({ cantidad: i.cantidad, nombre: i.nombre, precioTotal: i.precioUnitario * i.cantidad })));

  /** Cuántas entradas quedan cubiertas por combos con entrada incluida. */
  entradasEnCombos = computed(() =>
    this.itemsCarrito().filter(i => i.incluyeEntrada).reduce((acc, i) => acc + i.cantidad, 0));

  descuentos = computed(() => {
    const monto = montoEntradasCubiertas(this.butacasReservadas(), this.entradasEnCombos(), this.reservaService.precioBase());
    return monto > 0 ? [{ concepto: `Entrada incluida en combo (${this.entradasEnCombos()})`, monto }] : [];
  });

  nombresButacas = computed(() => this.butacasReservadas().map(b => `${b.fila}${b.columna}`));
  resumenEntradas = computed(() => resumirEntradasPorTipo(this.butacasReservadas()));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.cargarPelicula(id);
      this.reservaService.soloCandy.set(false);
    } else {
      // Compra solo de candy: si venía de otro flujo, se descartan butacas y función
      if (!this.reservaService.soloCandy()) this.reservaService.limpiarReserva();
      this.reservaService.soloCandy.set(true);
      this.soloCandy.set(true);
    }

    const params = this.route.snapshot.queryParamMap;
    this.horarioSeleccionado.set(params.get('horario') ?? '');
    this.salaSeleccionada.set(params.get('sala') ?? '');

    this.butacasReservadas.set(this.reservaService.butacas());

    // Si vuelve atrás desde el checkout, recuperamos lo que ya había elegido
    const previos: Record<string, number> = {};
    for (const c of this.reservaService.combos()) previos[`${c.tipo}:${c.id}`] = c.cantidad;
    this.carrito.set(previos);

    this.cargarCandy();
  }

  clave(p: ProductoCandy): string {
    return `${p.tipo}:${p.id}`;
  }

  async cargarPelicula(id: string): Promise<void> {
    try {
      const data: RawPelicula = await this.peliculaService.getPeliculaById(id);
      this.pelicula.set({
        id: String(data.id),
        titulo: data.titulo,
        sinopsis: data.sinopsis,
        duracion: Number(data.duracion_minutos),
        poster_url: data.url_imagen,
        clasificacion: data.restriccion_edad ? `+${data.restriccion_edad}` : 'ATP',
        generos: (data.pelicula_genero ?? []).map(r => r.generos?.nombre),
        formatos: [],
        idiomas: [],
        hero_imagen: data.hero_imagen
      });
    } catch (error) {
      console.error('Error cargando película:', error);
    }
  }

  async cargarCandy(): Promise<void> {
    const [combosRes, productosRes, categoriasRes] = await Promise.all([
      this.supabase.from('combos_candy').select('*').eq('activo', true),
      this.supabase.from('productos_candy').select('*').eq('activo', true).order('nombre'),
      this.supabase.from('categorias_candy').select('id, nombre').order('nombre')
    ]);

    const combos = ((combosRes.data ?? []) as RawComboCandy[]).map(c => ({
      id: String(c.id),
      tipo: 'combo' as const,
      nombre: c.nombre,
      descripcion: c.descripcion ?? '',
      precio: Number(c.precio),
      imagenUrl: c.imagen_url || IMAGEN_DEFECTO,
      enOferta: !!c.en_oferta,
      incluyeEntrada: !!c.incluye_entrada,
      categoriaId: null
    }));
    // Destacados primero: los que incluyen entrada y los marcados en oferta
    combos.sort((a, b) => Number(b.incluyeEntrada) - Number(a.incluyeEntrada) || Number(b.enOferta) - Number(a.enOferta));
    this.combos.set(combos);

    this.productos.set(((productosRes.data ?? []) as RawProductoCandy[]).map(p => ({
      id: String(p.id),
      tipo: 'producto' as const,
      nombre: p.nombre,
      descripcion: '',
      precio: Number(p.precio),
      imagenUrl: p.url_imagen || IMAGEN_DEFECTO,
      enOferta: false,
      incluyeEntrada: false,
      categoriaId: p.categoria_id
    })));

    // Solo mostramos categorías que tengan productos
    const conProductos = new Set(this.productos().map(p => p.categoriaId));
    this.categorias.set((categoriasRes.data ?? []).filter(c => conProductos.has(c.id)));
  }

  getCantidad(p: ProductoCandy): number {
    return this.carrito()[this.clave(p)] || 0;
  }

  /** No se pueden pedir más combos con entrada que butacas elegidas. */
  puedeAgregar(p: ProductoCandy): boolean {
    return !p.incluyeEntrada || this.entradasEnCombos() < this.butacasReservadas().length;
  }

  incrementar(p: ProductoCandy): void {
    if (!this.puedeAgregar(p)) return;
    const k = this.clave(p);
    this.carrito.update(prev => ({ ...prev, [k]: (prev[k] || 0) + 1 }));
  }

  decrementar(p: ProductoCandy): void {
    const k = this.clave(p);
    this.carrito.update(prev => {
      const nuevo = { ...prev };
      if ((nuevo[k] || 0) <= 1) delete nuevo[k];
      else nuevo[k]--;
      return nuevo;
    });
  }

  irAlPago(): void {
    this.reservaService.combos.set(this.itemsCarrito());
    this.router.navigate(['/checkout']);
  }
}
