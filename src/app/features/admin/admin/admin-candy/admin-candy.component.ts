import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';
import { ImageDropzoneComponent } from '../../../../shared/components/image-dropzone/image-dropzone.component';

interface Categoria { id: number; nombre: string; }

interface Producto {
  id: string; nombre: string; precio: number; costo_puntos: number;
  url_imagen: string; activo: boolean; categoria_id: number | null;
}

interface Combo {
  id: string; nombre: string; descripcion: string | null; precio: number;
  imagen_url: string | null; activo: boolean; en_oferta: boolean; incluye_entrada: boolean;
}

type Pestania = 'productos' | 'combos' | 'categorias';

/** Candy bar (mail 30/01 y 03/03): categorías, productos y combos (con o sin entrada). */
@Component({
  selector: 'app-admin-candy',
  standalone: true,
  imports: [ReactiveFormsModule, CurrencyPipe, ImageDropzoneComponent],
  templateUrl: './admin-candy.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminCandyComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;
  private log = inject(LogService);

  pestania = signal<Pestania>('productos');
  categorias = signal<Categoria[]>([]);
  productos = signal<Producto[]>([]);
  combos = signal<Combo[]>([]);

  productoEditando = signal<Producto | null>(null);
  comboEditando = signal<Combo | null>(null);

  mensajeExito = signal('');
  mensajeError = signal('');
  guardando = signal(false);

  nombreCategoria = computed(() => {
    const mapa = new Map(this.categorias().map(c => [c.id, c.nombre]));
    return (id: number | null) => (id != null ? mapa.get(id) : undefined) ?? 'Sin categoría';
  });

  productoForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    categoria_id: [null as number | null, Validators.required],
    precio: [0, [Validators.required, Validators.min(1)]],
    costo_puntos: [0, [Validators.min(0)]],
    url_imagen: ['', Validators.required],
    activo: [true]
  });

  comboForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    descripcion: [''],
    precio: [0, [Validators.required, Validators.min(1)]],
    imagen_url: [''],
    incluye_entrada: [false],
    en_oferta: [false],
    activo: [true]
  });

  categoriaForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]]
  });

  async ngOnInit(): Promise<void> {
    await this.cargarTodo();
  }

  async cargarTodo(): Promise<void> {
    const [cat, prod, comb] = await Promise.all([
      this.supabase.from('categorias_candy').select('*').order('nombre'),
      this.supabase.from('productos_candy').select('*').order('nombre'),
      this.supabase.from('combos_candy').select('*').order('nombre')
    ]);
    this.categorias.set(cat.data ?? []);
    this.productos.set(prod.data ?? []);
    this.combos.set(comb.data ?? []);
  }

  cambiarPestania(p: Pestania): void {
    this.pestania.set(p);
    this.limpiarMensajes();
  }

  private limpiarMensajes(): void { this.mensajeExito.set(''); this.mensajeError.set(''); }

  private ok(texto: string): void {
    this.mensajeExito.set(texto);
    setTimeout(() => this.mensajeExito.set(''), 4000);
  }

  // ---------------- Productos ----------------

  editarProducto(p: Producto): void {
    this.productoEditando.set(p);
    this.productoForm.reset({ ...p });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarProducto(): void {
    this.productoEditando.set(null);
    this.productoForm.reset({ categoria_id: null, precio: 0, costo_puntos: 0, activo: true });
  }

  async guardarProducto(): Promise<void> {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      this.mensajeError.set('Completá nombre, categoría, precio e imagen.');
      return;
    }
    const v = this.productoForm.getRawValue();
    const payload = { ...v, precio: Number(v.precio), costo_puntos: Number(v.costo_puntos), categoria_id: Number(v.categoria_id) };
    const anterior = this.productoEditando();

    this.guardando.set(true);
    this.limpiarMensajes();
    try {
      if (anterior) {
        const { error } = await this.supabase.from('productos_candy').update(payload).eq('id', anterior.id);
        if (error) throw error;
        if (Number(anterior.precio) !== payload.precio) {
          await this.log.registrar('MODIFICAR_PRECIO', 'productos_candy', anterior.id,
            `Precio de "${anterior.nombre}": $${anterior.precio} → $${payload.precio}`);
        }
        if (Number(anterior.costo_puntos) !== payload.costo_puntos) {
          await this.log.registrar('MODIFICAR_PRECIO', 'productos_candy', anterior.id,
            `Costo en puntos de "${anterior.nombre}": ${anterior.costo_puntos} → ${payload.costo_puntos}`);
        }
        await this.log.registrar('MODIFICAR_PRODUCTO', 'productos_candy', anterior.id, `Se editó el producto "${payload.nombre}"`);
        this.ok(`Producto "${payload.nombre}" actualizado.`);
      } else {
        const { data, error } = await this.supabase.from('productos_candy').insert([payload]).select('id').single();
        if (error) throw error;
        await this.log.registrar('CREAR_PRODUCTO', 'productos_candy', data.id,
          `Se creó el producto "${payload.nombre}" a $${payload.precio}`);
        this.ok(`Producto "${payload.nombre}" creado.`);
      }
      this.cancelarProducto();
      await this.cargarTodo();
    } catch (err) {
      this.mensajeError.set(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      this.guardando.set(false);
    }
  }

  async toggleProducto(p: Producto): Promise<void> {
    await this.supabase.from('productos_candy').update({ activo: !p.activo }).eq('id', p.id);
    await this.log.registrar('MODIFICAR_PRODUCTO', 'productos_candy', p.id,
      `Producto "${p.nombre}" ${p.activo ? 'desactivado' : 'activado'}`);
    await this.cargarTodo();
  }

  // ---------------- Combos ----------------

  editarCombo(c: Combo): void {
    this.comboEditando.set(c);
    this.comboForm.reset({ ...c, descripcion: c.descripcion ?? '', imagen_url: c.imagen_url ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarCombo(): void {
    this.comboEditando.set(null);
    this.comboForm.reset({ precio: 0, incluye_entrada: false, en_oferta: false, activo: true });
  }

  async guardarCombo(): Promise<void> {
    if (this.comboForm.invalid) {
      this.comboForm.markAllAsTouched();
      this.mensajeError.set('Completá nombre y precio.');
      return;
    }
    const v = this.comboForm.getRawValue();
    const payload = { ...v, precio: Number(v.precio), imagen_url: v.imagen_url || null };
    const anterior = this.comboEditando();

    this.guardando.set(true);
    this.limpiarMensajes();
    try {
      if (anterior) {
        const { error } = await this.supabase.from('combos_candy').update(payload).eq('id', anterior.id);
        if (error) throw error;
        if (Number(anterior.precio) !== payload.precio) {
          await this.log.registrar('MODIFICAR_PRECIO', 'combos_candy', anterior.id,
            `Precio del combo "${anterior.nombre}": $${anterior.precio} → $${payload.precio}`);
        }
        await this.log.registrar('MODIFICAR_COMBO', 'combos_candy', anterior.id, `Se editó el combo "${payload.nombre}"`);
        this.ok(`Combo "${payload.nombre}" actualizado.`);
      } else {
        const { data, error } = await this.supabase.from('combos_candy').insert([payload]).select('id').single();
        if (error) throw error;
        await this.log.registrar('CREAR_COMBO', 'combos_candy', data.id,
          `Se creó el combo "${payload.nombre}" a $${payload.precio}${payload.incluye_entrada ? ' (incluye entrada)' : ''}`);
        this.ok(`Combo "${payload.nombre}" creado.`);
      }
      this.cancelarCombo();
      await this.cargarTodo();
    } catch (err) {
      this.mensajeError.set(err instanceof Error ? err.message : 'No se pudo guardar el combo.');
    } finally {
      this.guardando.set(false);
    }
  }

  async toggleCombo(c: Combo): Promise<void> {
    await this.supabase.from('combos_candy').update({ activo: !c.activo }).eq('id', c.id);
    await this.log.registrar('MODIFICAR_COMBO', 'combos_candy', c.id, `Combo "${c.nombre}" ${c.activo ? 'desactivado' : 'activado'}`);
    await this.cargarTodo();
  }

  // ---------------- Categorías ----------------

  async crearCategoria(): Promise<void> {
    if (this.categoriaForm.invalid) { this.categoriaForm.markAllAsTouched(); return; }
    const nombre = this.categoriaForm.getRawValue().nombre.trim();
    const { data, error } = await this.supabase.from('categorias_candy').insert([{ nombre }]).select('id').single();
    if (error) {
      this.mensajeError.set(error.code === '23505' ? `La categoría "${nombre}" ya existe.` : error.message);
      return;
    }
    await this.log.registrar('CREAR_CATEGORIA', 'categorias_candy', null, `Se creó la categoría "${nombre}" (id ${data.id})`);
    this.categoriaForm.reset();
    this.ok(`Categoría "${nombre}" creada.`);
    await this.cargarTodo();
  }

  cantidadProductos(categoriaId: number): number {
    return this.productos().filter(p => p.categoria_id === categoriaId).length;
  }

  async eliminarCategoria(c: Categoria): Promise<void> {
    if (this.cantidadProductos(c.id) > 0) {
      this.mensajeError.set('No se puede eliminar una categoría con productos. Cambialos de categoría primero.');
      return;
    }
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    const { error } = await this.supabase.from('categorias_candy').delete().eq('id', c.id);
    if (error) { this.mensajeError.set(error.message); return; }
    await this.log.registrar('ELIMINAR_CATEGORIA', 'categorias_candy', null, `Se eliminó la categoría "${c.nombre}"`);
    await this.cargarTodo();
  }
}
