import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../../core/services/supabase';

export interface CuponAdmin {
  id: string;
  codigo: string;
  porcentaje_descuento: number;
  solo_mayores_50: boolean;
  activo: boolean;
}

@Component({
  selector: 'app-admin-cupones',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-cupones.component.html',
  styleUrls: ['./admin-cupones.component.css']
})
export class AdminCuponesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;

  cargando = signal<boolean>(false);
  cupones = signal<CuponAdmin[]>([]);
  mensajeExito = signal<string>('');
  mensajeError = signal<string>('');

  cuponForm: FormGroup = this.fb.group({
    codigo: ['', [Validators.required, Validators.minLength(3)]],
    porcentaje_descuento: [20, [Validators.required, Validators.min(1), Validators.max(100)]],
    solo_mayores_50: [false],
    activo: [true]
  });

  ngOnInit() {
    this.cargarCupones();
  }

  async cargarCupones() {
    try {
      const { data, error } = await this.supabase
        .from('cupones')
        .select('*')
        .order('codigo', { ascending: true });

      if (error) throw error;
      this.cupones.set(data || []);
    } catch (err) {
      console.error('Error cargando cupones:', err);
    }
  }

  async guardarCupon() {
    if (this.cuponForm.invalid) {
      this.cuponForm.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.mensajeError.set('');
    this.mensajeExito.set('');

    try {
      const formVal = this.cuponForm.getRawValue();
      const codigoUpper = formVal.codigo.trim().toUpperCase();

      const { data: authData } = await this.supabase.auth.getUser();
      const usuarioId = authData?.user?.id;

      // Insertar nuevo cupón
      const { data: nuevoCupon, error: errInsert } = await this.supabase
        .from('cupones')
        .insert([{
          codigo: codigoUpper,
          porcentaje_descuento: Number(formVal.porcentaje_descuento),
          solo_mayores_50: formVal.solo_mayores_50,
          activo: formVal.activo
        }])
        .select()
        .single();

      if (errInsert) throw errInsert;

      // Registrar auditoría en logs_actividad
      if (usuarioId) {
        await this.supabase.from('logs_actividad').insert([{
          perfil_id: usuarioId,
          accion: 'CREAR_CUPON',
          entidad_afectada: 'cupones',
          entidad_id: nuevoCupon.id,
          detalle: `Se creó el cupón ${codigoUpper} con ${formVal.porcentaje_descuento}% de descuento`
        }]);
      }

      this.mensajeExito.set(`¡Cupón "${codigoUpper}" creado con éxito!`);
      this.cuponForm.reset({ porcentaje_descuento: 20, solo_mayores_50: false, activo: true });
      await this.cargarCupones();

    } catch (err: any) {
      console.error(err);
      this.mensajeError.set(err.message || 'Error al guardar el cupón.');
    } finally {
      this.cargando.set(false);
      setTimeout(() => this.mensajeExito.set(''), 4000);
    }
  }

  async toggleEstadoCupon(cupon: CuponAdmin) {
    try {
      const nuevoEstado = !cupon.activo;
      const { error } = await this.supabase
        .from('cupones')
        .update({ activo: nuevoEstado })
        .eq('id', cupon.id);

      if (error) throw error;

      const { data: authData } = await this.supabase.auth.getUser();
      if (authData?.user) {
        await this.supabase.from('logs_actividad').insert([{
          perfil_id: authData.user.id,
          accion: 'MODIFICAR_CUPON',
          entidad_afectada: 'cupones',
          entidad_id: cupon.id,
          detalle: `Se cambió el estado del cupón ${cupon.codigo} a activo: ${nuevoEstado}`
        }]);
      }

      await this.cargarCupones();
    } catch (err) {
      console.error('Error al cambiar estado del cupón:', err);
    }
  }
}
