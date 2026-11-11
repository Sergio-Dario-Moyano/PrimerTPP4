import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../../core/services/supabase';
import { LogService } from '../../../../core/services/log.service';
import { CODIGO_BIENVENIDA } from '../../../../core/utils/constantes';

export interface CuponAdmin {
  id: string;
  codigo: string;
  porcentaje_descuento: number;
  solo_mayores_50: boolean;
  activo: boolean;
}


/**
 * Cupones: alta y EDICIÓN (porcentaje, restricción +50, activo).
 * El porcentaje del cupón de bienvenida se configura acá (mail 30/01).
 */
@Component({
  selector: 'app-admin-cupones',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './admin-cupones.component.html',
  styleUrls: ['../admin-shared.css']
})
export class AdminCuponesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;
  private log = inject(LogService);

  readonly CODIGO_BIENVENIDA = CODIGO_BIENVENIDA;

  cupones = signal<CuponAdmin[]>([]);
  editandoId = signal<string | null>(null);
  cargando = signal<boolean>(false);
  mensajeExito = signal<string>('');
  mensajeError = signal<string>('');

  nuevoForm = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    porcentaje_descuento: [null as number | null, [Validators.required, Validators.min(1), Validators.max(100)]],
    solo_mayores_50: [false]
  });

  edicionForm = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    porcentaje_descuento: [0, [Validators.required, Validators.min(1), Validators.max(100)]],
    solo_mayores_50: [false],
    activo: [true]
  });

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    const { data, error } = await this.supabase.from('cupones').select('*').order('codigo');
    if (error) { this.mensajeError.set(error.message); return; }
    this.cupones.set(data ?? []);
  }

  async crear(): Promise<void> {
    if (this.nuevoForm.invalid) { this.nuevoForm.markAllAsTouched(); return; }
    const v = this.nuevoForm.getRawValue();
    const codigo = v.codigo.trim().toUpperCase();

    this.cargando.set(true);
    this.limpiarMensajes();
    const { data, error } = await this.supabase.from('cupones').insert([{
      codigo, porcentaje_descuento: Number(v.porcentaje_descuento), solo_mayores_50: v.solo_mayores_50, activo: true
    }]).select('id').single();
    this.cargando.set(false);

    if (error) {
      this.mensajeError.set(error.code === '23505' ? `Ya existe un cupón ${codigo}.` : error.message);
      return;
    }
    await this.log.registrar('CREAR_CUPON', 'cupones', data.id,
      `Se creó el cupón ${codigo} (${v.porcentaje_descuento}%${v.solo_mayores_50 ? ', solo +50' : ''})`);
    this.mensajeExito.set(`Cupón ${codigo} creado.`);
    this.nuevoForm.reset();
    await this.cargar();
  }

  editar(c: CuponAdmin): void {
    this.limpiarMensajes();
    this.editandoId.set(c.id);
    this.edicionForm.reset({
      codigo: c.codigo, porcentaje_descuento: c.porcentaje_descuento,
      solo_mayores_50: c.solo_mayores_50, activo: c.activo
    });
    // El código BIENVENIDA lo usa la app para el cupón de primera compra: no se renombra
    if (c.codigo === CODIGO_BIENVENIDA) this.edicionForm.controls.codigo.disable();
    else this.edicionForm.controls.codigo.enable();
  }

  cancelar(): void {
    this.editandoId.set(null);
    this.edicionForm.reset();
  }

  async guardar(c: CuponAdmin): Promise<void> {
    if (this.edicionForm.invalid) { this.edicionForm.markAllAsTouched(); return; }
    const v = this.edicionForm.getRawValue();
    const cambios = {
      codigo: (v.codigo || c.codigo).trim().toUpperCase(),
      porcentaje_descuento: Number(v.porcentaje_descuento),
      solo_mayores_50: v.solo_mayores_50,
      activo: v.activo
    };

    const { error } = await this.supabase.from('cupones').update(cambios).eq('id', c.id);
    if (error) {
      this.mensajeError.set(error.code === '23505' ? `Ya existe un cupón ${cambios.codigo}.` : error.message);
      return;
    }

    const detalle: string[] = [];
    if (c.codigo !== cambios.codigo) detalle.push(`código ${c.codigo} → ${cambios.codigo}`);
    if (Number(c.porcentaje_descuento) !== cambios.porcentaje_descuento) detalle.push(`descuento ${c.porcentaje_descuento}% → ${cambios.porcentaje_descuento}%`);
    if (c.solo_mayores_50 !== cambios.solo_mayores_50) detalle.push(`solo +50: ${cambios.solo_mayores_50 ? 'sí' : 'no'}`);
    if (c.activo !== cambios.activo) detalle.push(cambios.activo ? 'activado' : 'desactivado');

    if (detalle.length) {
      await this.log.registrar('MODIFICAR_CUPON', 'cupones', c.id, `Cupón ${c.codigo}: ${detalle.join(', ')}`);
    }
    this.mensajeExito.set(`Cupón ${cambios.codigo} actualizado.`);
    this.cancelar();
    await this.cargar();
  }

  private limpiarMensajes(): void {
    this.mensajeExito.set('');
    this.mensajeError.set('');
  }
}
