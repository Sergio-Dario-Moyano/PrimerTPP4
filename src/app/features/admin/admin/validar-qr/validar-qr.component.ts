import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseService } from '../../../../core/services/supabase';

@Component({
  selector: 'app-validar-qr',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './validar-qr.component.html',
  styleUrls: ['./validar-qr.component.css']
})
export class ValidarQrComponent {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;

  cargando = signal<boolean>(false);
  resultadoValidacion = signal<any | null>(null);
  mensajeError = signal<string>('');

  validarForm: FormGroup = this.fb.group({
    codigoManual: ['', [Validators.required, Validators.minLength(3)]]
  });

  async procesarValidacion() {
    if (this.validarForm.invalid) {
      this.validarForm.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.resultadoValidacion.set(null);
    this.mensajeError.set('');

    const codigo = this.validarForm.get('codigoManual')?.value.trim().toUpperCase();

    try {
      const { data: authData } = await this.supabase.auth.getUser();
      const usuarioId = authData?.user?.id;

      // 1. Buscar en la tabla de ENTRADAS (Cine)
      const { data: entrada, error: errEntrada } = await this.supabase
        .from('entradas')
        .select(`
          id,
          estado,
          cliente_nombre,
          precio_cobrado,
          funciones ( fecha_hora, salas ( nombre ), peliculas ( titulo ) )
        `)
        .eq('codigo_manual', codigo)
        .maybeSingle();

      if (entrada) {
        if (entrada.estado === 'validada') {
          this.mensajeError.set(`Esta entrada a nombre de ${entrada.cliente_nombre} ya fue validada previamente.`);
          return;
        }

        if (entrada.estado === 'cancelada') {
          this.mensajeError.set('Esta entrada figura como cancelada y no puede ser utilizada.');
          return;
        }

        const { error: errUpdate } = await this.supabase
          .from('entradas')
          .update({ estado: 'validada' })
          .eq('id', entrada.id);

        if (errUpdate) throw errUpdate;

        if (usuarioId) {
          await this.supabase.from('logs_actividad').insert([{
            perfil_id: usuarioId,
            accion: 'VALIDAR_ENTRADA',
            entidad_afectada: 'entradas',
            entidad_id: entrada.id,
            detalle: `Se validó la entrada de cine (PIN: ${codigo}) para ${entrada.cliente_nombre}`
          }]);
        }

        this.resultadoValidacion.set({
          tipo: 'CINE',
          titulo: (entrada.funciones as any)?.peliculas?.titulo,
          sala: (entrada.funciones as any)?.salas?.nombre,
          cliente: entrada.cliente_nombre,
          estado: 'VALIDADA CON ÉXITO'
        });

        this.validarForm.reset();
        return;
      }

      // 2. Si no es entrada, buscar en DETALLE_CANDY (Candy Bar)
      const { data: candyList, error: errCandy } = await this.supabase
        .from('detalle_candy')
        .select(`
          id,
          estado,
          cantidad,
          combos_candy ( nombre )
        `)
        .eq('estado', 'pendiente');

      const candyEncontrado = (candyList || []).find(c => c.id.toUpperCase().startsWith(codigo) || c.id.toUpperCase() === codigo);

      if (candyEncontrado) {
        const { error: errUpdateCandy } = await this.supabase
          .from('detalle_candy')
          .update({ estado: 'entregado' })
          .eq('id', candyEncontrado.id);

        if (errUpdateCandy) throw errUpdateCandy;

        if (usuarioId) {
          await this.supabase.from('logs_actividad').insert([{
            perfil_id: usuarioId,
            accion: 'VALIDAR_CANDY',
            entidad_afectada: 'detalle_candy',
            entidad_id: candyEncontrado.id,
            detalle: `Se entregó el producto de candy bar (ID: ${codigo})`
          }]);
        }

        const comboInfo: any = candyEncontrado.combos_candy;
        this.resultadoValidacion.set({
          tipo: 'CANDY BAR',
          producto: comboInfo?.nombre || 'Combo Confitería',
          cantidad: candyEncontrado.cantidad,
          estado: 'ENTREGADO CON ÉXITO'
        });

        this.validarForm.reset();
        return;
      }

      this.mensajeError.set('No se encontró ninguna entrada o producto de confitería activo con este código.');

    } catch (err: any) {
      console.error(err);
      this.mensajeError.set(err.message || 'Error al procesar la validación.');
    } finally {
      this.cargando.set(false);
    }
  }
}
