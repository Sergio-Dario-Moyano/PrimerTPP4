import { Component, inject, computed, signal, OnInit, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReservaService } from '../../../core/services/reserva.service';
import { SupabaseService } from '../../../core/services/supabase';
import { ModalService } from '../../../core/services/modal.service';

import { CompraInsert } from '../../../core/models/Compra.model';
import { EntradaInsert } from '../../../core/models/Entrada.model';
import { DetalleCandyInsert } from '../../../core/models/DetalleCandyInsert.model';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  private reservaService = inject(ReservaService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  private modalService = inject(ModalService);

  checkoutForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    tarjeta: ['', [Validators.required, Validators.pattern('^[0-9]{16}$')]],
    vencimiento: ['', [Validators.required, Validators.pattern('^(0[1-9]|1[0-2])\/([0-9]{2})$')]],
    cvc: ['', [Validators.required, Validators.pattern('^[0-9]{3,4}$')]]
  });

  cuponControl = this.fb.control('');

  procesando = signal(false);
  validandoCupon = signal(false);
  miInput = input();

  descuentoPorcentaje = signal(0);
  cuponId = signal<string | null>(null);
  cuponMensaje = signal<{texto: string, tipo: 'exito' | 'error'} | null>(null);

  butacas = computed(() => this.reservaService.butacas());
  combos = computed(() => this.reservaService.combos());

  subtotalEntradas = computed(() => this.butacas().length * 5000);
  subtotalCandy = computed(() => this.combos().reduce((acc, c) => acc + (c.precioUnitario * c.cantidad), 0));
  cargoServicio = computed(() => (this.butacas().length > 0 ? 1050 : 0) + (this.combos().length > 0 ? 900 : 0));

  subtotalGeneral = computed(() => this.subtotalEntradas() + this.subtotalCandy() + this.cargoServicio());
  montoDescuento = computed(() => this.subtotalGeneral() * (this.descuentoPorcentaje() / 100));
  totalPagar = computed(() => this.subtotalGeneral() - this.montoDescuento());

  ngOnInit(): void {
    if (this.butacas().length === 0) {
      this.router.navigate(['/']);
      return;
    }
  }

  async aplicarCupon(): Promise<void> {
    const codigo = this.cuponControl.value?.trim().toUpperCase();
    if (!codigo) return;

    this.validandoCupon.set(true);
    this.cuponMensaje.set(null);

    try {
      const supabase = this.supabaseService.client;
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const usuarioActivo = authData?.user;

      if (authError || !usuarioActivo) {
        throw new Error('Debes iniciar sesión para usar cupones.');
      }

      const { data: cuponData, error: cuponError } = await supabase
        .from('cupones')
        .select('id, porcentaje_descuento, solo_mayores_50, activo')
        .eq('codigo', codigo)
        .single();

      if (cuponError || !cuponData) throw new Error('Cupón no válido o inexistente.');
      if (!cuponData.activo) throw new Error('Este cupón ya no está activo.');

      const { data: compraPrevia, error: compraPreviaError } = await supabase
        .from('compras')
        .select('id')
        .eq('perfil_id', usuarioActivo.id)
        .eq('cupon_id', cuponData.id);

      if (compraPreviaError) throw new Error('Error al validar el historial de uso del cupón.');
      if (compraPrevia && compraPrevia.length > 0) throw new Error('Ya has utilizado este cupón en una compra anterior.');

      if (cuponData.solo_mayores_50) {
        const { data: perfilData, error: perfilError } = await supabase
          .from('perfiles')
          .select('fecha_nacimiento')
          .eq('id', usuarioActivo.id)
          .single();

        if (perfilError || !perfilData?.fecha_nacimiento) {
           throw new Error('Debes registrar tu fecha de nacimiento en tu perfil para usar este cupón.');
        }

        const fechaNacimiento = new Date(perfilData.fecha_nacimiento);
        const hoy = new Date();
        let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
        const mes = hoy.getMonth() - fechaNacimiento.getMonth();

        if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
            edad--;
        }

        if (edad <= 50) {
          throw new Error('Este cupón es exclusivo para clientes mayores de 50 años.');
        }
      }

      this.descuentoPorcentaje.set(cuponData.porcentaje_descuento);
      this.cuponId.set(cuponData.id);
      this.cuponMensaje.set({ texto: `¡Cupón aplicado! ${cuponData.porcentaje_descuento}% OFF`, tipo: 'exito' });

    } catch (err) {
      const mensajeError = err instanceof Error ? err.message : 'Error al procesar el cupón';
      this.descuentoPorcentaje.set(0);
      this.cuponId.set(null);
      this.cuponMensaje.set({ texto: mensajeError, tipo: 'error' });
    } finally {
      this.validandoCupon.set(false);
    }
  }

  async procesarPago(): Promise<void> {
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    this.procesando.set(true);
    const supabase = this.supabaseService.client;
    const funcionId = this.reservaService.funcionId();

    if (!funcionId) {
      // MODAL GLOBAL
      this.modalService.open('Error Crítico', 'No se encontró la función. Por favor, vuelve a iniciar la compra.', 'error');
      this.procesando.set(false);
      this.router.navigate(['/']);
      return;
    }

    try {
      const { data: authData } = await supabase.auth.getUser();
      const usuarioActivo = authData?.user;

      const nombreTitular = this.checkoutForm.get('nombre')?.value;
      const emailContacto = this.checkoutForm.get('email')?.value;

      const payloadCompra: CompraInsert = {
        perfil_id: usuarioActivo ? usuarioActivo.id : null,
        cupon_id: this.cuponId(),
        total_pagado: this.totalPagar(),
        metodo_pago: 'efectivo',
        fecha_compra: new Date().toISOString(),
        estado: 'completada',
        email_contacto: emailContacto
      };

      const { data: nuevaCompra, error: errorCompra } = await supabase
        .from('compras')
        .insert(payloadCompra)
        .select('id')
        .single();

      if (errorCompra) throw new Error(`Error en Compras: ${errorCompra.message}`);

      const codigoManualCorto = Math.random().toString(36).substring(2, 8).toUpperCase();

      const entradasAInsertar: EntradaInsert[] = this.butacas().map(butaca => {
        const payloadQR = JSON.stringify({
          compra_id: nuevaCompra.id,
          titular: nombreTitular,
          asiento: `Fila ${butaca.fila} Col ${butaca.columna}`,
          funcion: funcionId,
          codigo_manual: codigoManualCorto,
          ticket_id: crypto.randomUUID()
        });

        return {
          compra_id: nuevaCompra.id,
          funcion_id: funcionId,
          butaca_id: butaca.id,
          cliente_nombre: nombreTitular,
          precio_cobrado: 5000,
          codigo_qr: payloadQR,
          codigo_manual: codigoManualCorto,
          estado: 'validada'
        };
      });

      const { error: errorEntradas } = await supabase
        .from('entradas')
        .insert(entradasAInsertar);

      if (errorEntradas) throw new Error(`Error en Entradas: ${errorEntradas.message}`);

      if (this.combos().length > 0) {
        const combosAInsertar: DetalleCandyInsert[] = this.combos().map(combo => ({
          compra_id: nuevaCompra.id,
          combo_id: combo.id,
          cantidad: combo.cantidad,
          codigo_qr: crypto.randomUUID(),
          estado: 'pendiente'
        }));

        const { error: errorCombos } = await supabase
          .from('detalle_candy')
          .insert(combosAInsertar);

        if (errorCombos) throw new Error(`Error en Combos: ${errorCombos.message}`);
      }

      if (usuarioActivo) {
        const { data: perfil, error: errorPerfil } = await supabase
          .from('perfiles')
          .select('puntos_fidelizacion')
          .eq('id', usuarioActivo.id)
          .single();

        if (!errorPerfil) {
          const nuevosPuntos = (perfil?.puntos_fidelizacion || 0) + this.totalPagar();
          await supabase
            .from('perfiles')
            .update({ puntos_fidelizacion: nuevosPuntos })
            .eq('id', usuarioActivo.id);
        }
      }

      this.checkoutForm.reset();
      this.cuponControl.reset();
      this.reservaService.limpiarReserva();

      this.router.navigate(['/ticket', nuevaCompra.id]);

    } catch (error) {
      const mensajeError = error instanceof Error ? error.message : 'Error desconocido al procesar el pago';
      console.error('Error procesando el pago:', error);
      // MODAL GLOBAL
      this.modalService.open('Error al pagar', mensajeError, 'error');
    } finally {
      this.procesando.set(false);
    }
  }
}
