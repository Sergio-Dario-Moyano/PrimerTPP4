import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReservaService } from '../../../core/services/reserva.service';
import { SupabaseService } from '../../../core/services/supabase';
import { ModalService } from '../../../core/services/modal.service';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';
import { FidelizacionService } from '../../../core/services/fidelizacion.service';

import { CompraInsert } from '../../../core/models/Compra.model';
import { EntradaInsert } from '../../../core/models/Entrada.model';
import { DetalleCandyInsert } from '../../../core/models/DetalleCandyInsert.model';
import { resumirEntradasPorTipo, montoEntradasCubiertas } from '../../../core/utils/precios';
import { CODIGO_BIENVENIDA } from '../../../core/utils/constantes';
import { MascaraTarjetaDirective } from '../../../shared/directives/mascara-tarjeta.directive';

export type MedioPago = 'tarjeta' | 'efectivo';

interface PerfilCheckout {
  fecha_nacimiento: string | null;
  puntos_fidelizacion: number;
  credito_favor: number;
  entradas_gratis: number;
}

/**
 * Checkout. Orden de cálculo del total:
 *   entradas + candy
 *   − entradas cubiertas por combos con entrada / entradas gratis (canje de puntos)
 *   − cupón (%)
 *   − crédito a favor (cancelaciones anteriores)
 *   − puntos (cada punto vale "valor_punto_pesos", configurable en el admin)
 *   = resto a pagar con tarjeta o en efectivo  →  1 punto por cada peso pagado
 *
 * El crédito y los puntos sirven para cualquier entrada o producto. Si no alcanzan,
 * se descuentan igual y el faltante se cobra con tarjeta o efectivo.
 */
@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, MascaraTarjetaDirective],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  private reservaService = inject(ReservaService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private supabase = inject(SupabaseService).client;
  private modalService = inject(ModalService);
  private listaEspera = inject(ListaEsperaService);
  private fidelizacion = inject(FidelizacionService);

  checkoutForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    tarjeta: ['', [Validators.required, Validators.pattern('^[0-9]{4}( [0-9]{4}){3}$')]],
    vencimiento: ['', [Validators.required, Validators.pattern('^(0[1-9]|1[0-2])/([0-9]{2})$')]],
    cvc: ['', [Validators.required, Validators.pattern('^[0-9]{3,4}$')]]
  });

  cuponControl = this.fb.nonNullable.control('');

  /** Medio de pago elegido para el saldo que quede después de crédito y canjes. */
  medioPago = signal<MedioPago>('tarjeta');

  procesando = signal(false);
  validandoCupon = signal(false);

  descuentoPorcentaje = signal(0);
  cuponId = signal<string | null>(null);
  cuponMensaje = signal<{ texto: string; tipo: 'exito' | 'error' } | null>(null);

  // Datos del usuario logueado (crédito, entradas gratis)
  usuarioId = signal<string | null>(null);
  perfil = signal<PerfilCheckout | null>(null);
  usarCredito = signal(false);
  usarPuntos = signal(false);
  /** Pesos que vale cada punto al pagar (configuración del admin). */
  valorPunto = signal(1);
  entradasGratisAUsar = signal(0);

  butacas = computed(() => this.reservaService.butacas());
  combos = computed(() => this.reservaService.combos());
  precioBase = computed(() => this.reservaService.precioBase());
  soloCandy = computed(() => this.butacas().length === 0);

  detalleEntradas = computed(() => resumirEntradasPorTipo(this.butacas()));
  subtotalEntradas = computed(() => this.butacas().reduce((acc, b) => acc + b.precio, 0));
  subtotalCandy = computed(() => this.combos().reduce((acc, c) => acc + c.precioUnitario * c.cantidad, 0));

  /** Entradas que ya paga un combo "entrada + pochoclo + bebida". */
  entradasEnCombos = computed(() =>
    Math.min(this.butacas().length,
      this.combos().filter(c => c.incluyeEntrada).reduce((acc, c) => acc + c.cantidad, 0)));

  /** Máximo de entradas gratis aplicables: las que tiene y que no estén ya cubiertas por combos. */
  maxEntradasGratis = computed(() =>
    Math.min(this.perfil()?.entradas_gratis ?? 0, this.butacas().length - this.entradasEnCombos()));

  /** Monto de entradas cubierto por combos + entradas gratis. */
  montoCubierto = computed(() => montoEntradasCubiertas(
    this.butacas(), this.entradasEnCombos() + this.entradasGratisAUsar(), this.precioBase()));
  montoCombos = computed(() => montoEntradasCubiertas(this.butacas(), this.entradasEnCombos(), this.precioBase()));
  montoGratis = computed(() => this.montoCubierto() - this.montoCombos());

  subtotalGeneral = computed(() =>
    this.subtotalEntradas() + this.subtotalCandy() - this.montoCubierto());
  montoDescuento = computed(() => Math.round(this.subtotalGeneral() * (this.descuentoPorcentaje() / 100)));

  creditoDisponible = computed(() => Number(this.perfil()?.credito_favor ?? 0));
  creditoAplicado = computed(() =>
    this.usarCredito() ? Math.min(this.creditoDisponible(), this.subtotalGeneral() - this.montoDescuento()) : 0);

  /** Lo que queda después del crédito: es lo que pueden cubrir los puntos. */
  restanteTrasCredito = computed(() =>
    Math.max(0, this.subtotalGeneral() - this.montoDescuento() - this.creditoAplicado()));

  puntosDisponibles = computed(() => Number(this.perfil()?.puntos_fidelizacion ?? 0));
  /** Pesos que valen todos los puntos del usuario. */
  valorPuntosDisponibles = computed(() => this.puntosDisponibles() * this.valorPunto());

  /** Puntos que se usan: los necesarios para cubrir el resto, o todos si no alcanzan. */
  puntosAplicados = computed(() => {
    const restante = this.restanteTrasCredito();
    if (!this.usarPuntos() || restante <= 0 || this.valorPunto() <= 0) return 0;
    return Math.min(this.puntosDisponibles(), Math.ceil(restante / this.valorPunto()));
  });
  montoPuntos = computed(() => Math.min(this.restanteTrasCredito(), this.puntosAplicados() * this.valorPunto()));

  totalPagar = computed(() => Math.max(0, this.restanteTrasCredito() - this.montoPuntos()));
  puntosAGanar = computed(() => this.usuarioId() ? Math.floor(this.totalPagar()) : 0);

  /** Hay un saldo a pagar (si el crédito / canjes cubren todo, no se elige medio de pago). */
  hayQuePagar = computed(() => this.totalPagar() > 0);

  /** Solo se piden los datos de la tarjeta si hay saldo y se eligió tarjeta. */
  requiereTarjeta = computed(() => this.hayQuePagar() && this.medioPago() === 'tarjeta');

  async ngOnInit(): Promise<void> {
    // Se puede pagar con butacas (entrada + candy opcional) o solo con candy
    if (this.butacas().length === 0 && this.combos().length === 0) {
      this.router.navigate(['/']);
      return;
    }

    const { data } = await this.supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;

    this.usuarioId.set(user.id);
    this.checkoutForm.patchValue({ email: user.email ?? '' });

    this.valorPunto.set(await this.fidelizacion.getConfig('valor_punto_pesos', 1));

    const { data: perfil } = await this.supabase
      .from('perfiles')
      .select('nombre, apellido, fecha_nacimiento, puntos_fidelizacion, credito_favor, entradas_gratis')
      .eq('id', user.id)
      .single();

    if (perfil) {
      this.perfil.set(perfil as PerfilCheckout);
      // Reubicación por función cancelada: el crédito se aplica de entrada
      if (this.reservaService.reubicacion() && Number(perfil.credito_favor) > 0) this.usarCredito.set(true);
      this.checkoutForm.patchValue({ nombre: `${perfil.nombre} ${perfil.apellido}`.trim() });
    }
  }

  elegirMedioPago(medio: MedioPago): void {
    this.medioPago.set(medio);
    // Al pasar a efectivo limpiamos los datos de la tarjeta para no guardarlos de más
    if (medio === 'efectivo') {
      this.checkoutForm.patchValue({ tarjeta: '', vencimiento: '', cvc: '' });
      this.checkoutForm.controls.tarjeta.markAsUntouched();
      this.checkoutForm.controls.vencimiento.markAsUntouched();
      this.checkoutForm.controls.cvc.markAsUntouched();
    }
  }

  cambiarEntradasGratis(delta: number): void {
    const nuevo = this.entradasGratisAUsar() + delta;
    if (nuevo >= 0 && nuevo <= this.maxEntradasGratis()) this.entradasGratisAUsar.set(nuevo);
  }

  private calcularEdad(fechaNacimiento: string): number {
    const nac = new Date(`${fechaNacimiento}T00:00:00`);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  }

  async aplicarCupon(): Promise<void> {
    const codigo = this.cuponControl.value.trim().toUpperCase();
    if (!codigo) return;

    this.validandoCupon.set(true);
    this.cuponMensaje.set(null);

    try {
      const usuarioId = this.usuarioId();
      if (!usuarioId) throw new Error('Debes iniciar sesión para usar cupones.');

      const { data: cupon } = await this.supabase
        .from('cupones')
        .select('id, porcentaje_descuento, solo_mayores_50, activo')
        .eq('codigo', codigo)
        .maybeSingle();

      if (!cupon) throw new Error('Cupón no válido o inexistente.');
      if (!cupon.activo) throw new Error('Este cupón ya no está activo.');

      const { data: usosPrevios } = await this.supabase
        .from('compras').select('id').eq('perfil_id', usuarioId).eq('cupon_id', cupon.id).limit(1);
      if (usosPrevios?.length) throw new Error('Ya usaste este cupón en una compra anterior.');

      // El cupón de bienvenida es solo para la PRIMERA compra
      if (codigo === CODIGO_BIENVENIDA) {
        const { data: compras } = await this.supabase
          .from('compras').select('id').eq('perfil_id', usuarioId).limit(1);
        if (compras?.length) throw new Error('El cupón de bienvenida es solo para tu primera compra.');
      }

      if (cupon.solo_mayores_50) {
        const nacimiento = this.perfil()?.fecha_nacimiento;
        if (!nacimiento || this.calcularEdad(nacimiento) <= 50) {
          throw new Error('Este cupón es exclusivo para clientes de más de 50 años.');
        }
      }

      this.descuentoPorcentaje.set(Number(cupon.porcentaje_descuento));
      this.cuponId.set(cupon.id);
      this.cuponMensaje.set({ texto: `¡Cupón aplicado! ${cupon.porcentaje_descuento}% OFF`, tipo: 'exito' });
    } catch (err) {
      this.descuentoPorcentaje.set(0);
      this.cuponId.set(null);
      this.cuponMensaje.set({ texto: err instanceof Error ? err.message : 'Error al procesar el cupón', tipo: 'error' });
    } finally {
      this.validandoCupon.set(false);
    }
  }

  /** Precio efectivamente cobrado por cada butaca (las cubiertas por combo / canje cobran solo el recargo). */
  private preciosPorButaca(): Map<string, number> {
    const precios = new Map(this.butacas().map(b => [b.id, b.precio]));
    const cubiertas = [...this.butacas()]
      .sort((a, b) => a.precio - b.precio)
      .slice(0, this.entradasEnCombos() + this.entradasGratisAUsar());
    for (const b of cubiertas) precios.set(b.id, b.precio - Math.min(b.precio, this.precioBase()));
    return precios;
  }

  async procesarPago(): Promise<void> {
    const c = this.checkoutForm.controls;
    const datosTitularOk = c.nombre.valid && c.email.valid;
    const tarjetaOk = c.tarjeta.valid && c.vencimiento.valid && c.cvc.valid;

    if (!datosTitularOk || (this.requiereTarjeta() && !tarjetaOk)) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    const funcionId = this.reservaService.funcionId();
    if (!funcionId && !this.soloCandy()) {
      this.modalService.open('Error', 'No se encontró la función. Volvé a iniciar la compra.', 'error');
      this.router.navigate(['/']);
      return;
    }

    this.procesando.set(true);

    try {
      const usuarioId = this.usuarioId();
      const nombreTitular = c.nombre.value;
      const credito = this.creditoAplicado();
      const puntosUsados = this.puntosAplicados();
      const montoPuntos = this.montoPuntos();

      // Ej.: "credito+puntos+tarjeta". Si nada tuvo costo (todo cubierto por combos o canjes): "canje"
      const partes = [
        credito > 0 ? 'credito' : null,
        puntosUsados > 0 ? 'puntos' : null,
        this.totalPagar() > 0 ? this.medioPago() : null
      ].filter(Boolean);
      const metodo = partes.length ? partes.join('+') : 'canje';

      const payloadCompra: CompraInsert = {
        perfil_id: usuarioId,
        cupon_id: this.cuponId(),
        total_pagado: this.totalPagar(),
        credito_usado: credito,
        puntos_usados: puntosUsados,
        monto_puntos: montoPuntos,
        puntos_ganados: this.puntosAGanar(),
        metodo_pago: metodo,
        fecha_compra: new Date().toISOString(),
        estado: 'completada',
        email_contacto: c.email.value
      };

      const { data: nuevaCompra, error: errorCompra } = await this.supabase
        .from('compras').insert(payloadCompra).select('id, codigo_ticket').single();
      if (errorCompra) throw new Error(`Error en Compras: ${errorCompra.message}`);

      // Un único código por compra (trigger de la BD): sirve para sala y candy
      const codigoTicket: string = nuevaCompra.codigo_ticket;
      const precios = this.preciosPorButaca();

      const entradas: EntradaInsert[] = this.butacas().map(b => ({
        compra_id: nuevaCompra.id,
        funcion_id: funcionId!,
        butaca_id: b.id,
        cliente_nombre: nombreTitular,
        precio_cobrado: precios.get(b.id) ?? b.precio,
        codigo_qr: `${codigoTicket}-${b.fila}${b.columna}`,
        codigo_manual: codigoTicket,
        estado: 'pendiente'
      }));

      const { error: errorEntradas } = entradas.length
        ? await this.supabase.from('entradas').insert(entradas)
        : { error: null };
      if (errorEntradas) {
        // Si la butaca se ocupó mientras pagaba, deshacemos la compra
        await this.supabase.from('compras').delete().eq('id', nuevaCompra.id);
        throw new Error(errorEntradas.code === '23505'
          ? 'Alguna de tus butacas acaba de ser comprada por otra persona. Elegí otras.'
          : errorEntradas.message?.includes('LISTA_ESPERA')
            ? 'Estas butacas están reservadas para quien tiene el turno en la lista de espera. Anotate y te avisamos cuando sea tu turno.'
            : `Error en Entradas: ${errorEntradas.message}`);
      }

      if (this.combos().length > 0) {
        const candy: DetalleCandyInsert[] = this.combos().map(item => ({
          compra_id: nuevaCompra.id,
          combo_id: item.tipo === 'combo' ? item.id : null,
          producto_id: item.tipo === 'producto' ? item.id : null,
          cantidad: item.cantidad,
          estado: 'pendiente'
        }));
        const { error: errorCandy } = await this.supabase.from('detalle_candy').insert(candy);
        if (errorCandy) throw new Error(`Error en Candy: ${errorCandy.message}`);
      }

      // Perfil: + puntos ganados − puntos usados, − crédito usado, − entradas gratis usadas
      const perfil = this.perfil();
      if (usuarioId && perfil) {
        await this.supabase.from('perfiles').update({
          puntos_fidelizacion: (perfil.puntos_fidelizacion ?? 0) + this.puntosAGanar() - puntosUsados,
          credito_favor: Number(perfil.credito_favor ?? 0) - credito,
          entradas_gratis: (perfil.entradas_gratis ?? 0) - this.entradasGratisAUsar()
        }).eq('id', usuarioId);
      }

      // Si estaba en la lista de espera de esta función, sale de la lista (y libera su reserva)
      if (usuarioId && funcionId) await this.listaEspera.marcarCompra(funcionId, usuarioId);
      // Si quedaron butacas liberadas sin comprar, el turno pasa al siguiente de la lista
      if (funcionId) await this.listaEspera.procesar(funcionId);

      this.checkoutForm.reset();
      this.cuponControl.reset();
      this.medioPago.set('tarjeta');
      this.usarPuntos.set(false);
      this.reservaService.limpiarReserva();
      this.router.navigate(['/ticket', nuevaCompra.id]);
    } catch (error) {
      console.error('Error procesando el pago:', error);
      this.modalService.open('Error al pagar', error instanceof Error ? error.message : 'Error desconocido', 'error');
    } finally {
      this.procesando.set(false);
    }
  }
}
