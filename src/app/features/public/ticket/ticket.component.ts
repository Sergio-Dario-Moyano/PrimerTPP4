import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
import { ListaEsperaService } from '../../../core/services/lista-espera.service';

import { CompraData } from '../../../core/models/CompraData.model';
import { EntradaData } from '../../../core/models/EntradaData.model';
import { FuncionTicketData } from '../../../core/models/FuncionTicketData.model';
import { ComboData } from '../../../core/models/ComboData.model';

@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [DatePipe, QRCodeComponent, RouterLink],
  templateUrl: './ticket.component.html',
  styleUrls: ['./ticket.component.css']
})
export class TicketComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private authService = inject(AuthService);
  private modalService = inject(ModalService);
  private listaEspera = inject(ListaEsperaService);

  cargando = signal<boolean>(true);
  error = signal<string | null>(null);

  compra = signal<CompraData | null>(null);
  entradas = signal<EntradaData[]>([]);
  combos = signal<ComboData[]>([]);
  funcion = signal<FuncionTicketData | null>(null);

  clienteNombre = signal<string>('');
  qrData = signal<string>('');
  codigoManual = signal<string>('');
  codigo_ticket = signal<string>('');

  // Estados del candy de la compra (para saber si ya se retiró)
  estadosCandy = signal<string[]>([]);

  /** Cancelación permitida hasta 2 horas antes de la función (mail 10/03). */
  readonly HORAS_LIMITE_CANCELACION = 2;

  /**
   * Motivo por el que NO se puede cancelar, o null si se puede.
   * Una vez validada la entrada o entregado el candy, la compra ya se usó.
   */
  motivoNoCancelable = computed<string | null>(() => {
    const compra = this.compra();
    if (!compra || compra.estado === 'cancelada') return 'cancelada';

    if (this.entradas().some(e => e.estado === 'validada') ||
        this.estadosCandy().some(e => e === 'entregado')) {
      return 'Esta compra ya fue utilizada: no se puede cancelar.';
    }

    const fechaFuncion = this.funcion()?.fecha;
    if (fechaFuncion) {
      const limite = fechaFuncion.getTime() - this.HORAS_LIMITE_CANCELACION * 60 * 60 * 1000;
      if (Date.now() > limite) {
        return `Solo se puede cancelar hasta ${this.HORAS_LIMITE_CANCELACION} horas antes de la función.`;
      }
    }
    return null;
  });

  // Estados para el modal propio de cancelación
  modalCancelacionAbierto = signal<boolean>(false);
  datosCompraPendiente = signal<CompraData | null>(null);

  ngOnInit(): void {
    const compraId = this.route.snapshot.paramMap.get('id');
    if (compraId) {
      this.cargarTicket(compraId);
    } else {
      this.error.set('No se encontró el número de ticket.');
      this.cargando.set(false);
    }
  }

  async cargarTicket(compraId: string): Promise<void> {
    const supabase = this.supabaseService.client;

    try {
      const { data: compraData, error: errCompra } = await supabase
        .from('compras')
        .select('*')
        .eq('id', compraId)
        .single();

      if (errCompra) throw errCompra;
      this.compra.set(compraData as CompraData);
      this.codigo_ticket.set(compraData.codigo_ticket);
      // Compras solo de candy no tienen entradas: el titular es el email de contacto
      this.clienteNombre.set(compraData.email_contacto ?? '');
      // El QR y el PIN manual son el mismo código de ticket: sirve para sala y candy
      this.qrData.set(compraData.codigo_ticket);
      this.codigoManual.set(compraData.codigo_ticket);

      const { data: entradasData, error: errEntradas } = await supabase
        .from('entradas')
        .select(`
          *,
          butacas (
            fila,
            columna
          )
        `)
        .eq('compra_id', compraId);

      if (errEntradas) throw errEntradas;

      const entradasCasteadas = (entradasData || []) as EntradaData[];
      this.entradas.set(entradasCasteadas);

      if (entradasCasteadas.length > 0) {
        this.clienteNombre.set(entradasCasteadas[0].cliente_nombre);

        const funcionId = entradasCasteadas[0].funcion_id;

        if (funcionId) {
          const { data: funcionData, error: errFuncion } = await supabase
            .from('funciones')
            .select(`
              fecha_hora,
              peliculas ( titulo, restriccion_edad ),
              salas ( nombre )
            `)
            .eq('id', funcionId)
            .single();

          if (errFuncion) console.error("Error al cargar la función:", errFuncion);

          if (funcionData) {
            let fechaValida = new Date();
            if (funcionData.fecha_hora) {
              fechaValida = new Date(funcionData.fecha_hora.replace(' ', 'T'));
            }

            const datosPelicula = Array.isArray(funcionData.peliculas)
                                        ? funcionData.peliculas[0]
                                        : funcionData.peliculas;

            const datosSala = Array.isArray(funcionData.salas)
                                ? funcionData.salas[0]
                                : funcionData.salas;

            this.funcion.set({
               fecha: fechaValida,
               hora: fechaValida,
               pelicula: datosPelicula,
               sala: datosSala
            } as FuncionTicketData);
          }
        }
      }

      const { data: detalleCandy, error: errCandy } = await supabase
        .from('detalle_candy')
        .select('*')
        .eq('compra_id', compraId);

      if (errCandy) throw errCandy;

      this.estadosCandy.set((detalleCandy ?? []).map(d => d.estado as string));

      if (detalleCandy && detalleCandy.length > 0) {
        const [{ data: combosCandy }, { data: productosCandy }] = await Promise.all([
          supabase.from('combos_candy').select('id, nombre'),
          supabase.from('productos_candy').select('id, nombre')
        ]);

        const combosArmados = detalleCandy.map(detalle => {
          const nombre = combosCandy?.find(c => c.id === detalle.combo_id)?.nombre
            ?? productosCandy?.find(p => p.id === detalle.producto_id)?.nombre
            ?? 'Producto Candy Bar';
          return { combo_id: detalle.combo_id ?? detalle.producto_id, cantidad: detalle.cantidad, nombre };
        });
        this.combos.set(combosArmados);
      }

    } catch (err) {
      console.error('Error cargando ticket:', err);
      this.error.set('Hubo un problema al cargar tu ticket.');
    } finally {
      this.cargando.set(false);
    }
  }

  async descargarTicket(): Promise<void> {
    const elemento = document.getElementById('ticket-exportar');

    if (!elemento) {
      console.error('No se encontró el ticket en el DOM');
      return;
    }

    try {
      const canvas = await html2canvas(elemento, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#141414',
        scrollY: -window.scrollY
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      let finalHeight = (canvas.height * pdfWidth) / canvas.width;
      let finalWidth = pdfWidth;

      if (finalHeight > pageHeight) {
        finalHeight = pageHeight;
        finalWidth = (canvas.width * pageHeight) / canvas.height;
      }

      const xOffset = (pdfWidth - finalWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, finalWidth, finalHeight);
      pdf.save(`ticket-${this.codigo_ticket()}.pdf`);

    } catch (error) {
      console.error('Error al generar el PDF:', error);
    }
  }

  // Inicia el proceso de cancelación (abre el modal si hay sesión)
  intentarCancelar(datosCompra: CompraData | null) {
    if (!datosCompra) return;

    const motivo = this.motivoNoCancelable();
    if (motivo) {
      this.modalService.open('No se puede cancelar', motivo, 'error');
      return;
    }

    const usuarioActivo = this.authService.usuarioActual();

    if (!usuarioActivo) {
      this.modalService.open(
        'Beneficio Exclusivo',
        'Para cancelar tu entrada, debes iniciar sesión en tu cuenta de CineLanús.',
        'info'
      );
      this.router.navigate(['/login']);
      return;
    }

    // El reintegro es como crédito en la cuenta: la compra tiene que ser de este usuario
    if (!datosCompra.perfil_id) {
      this.modalService.open('No se puede cancelar',
        'Las compras hechas sin cuenta no se pueden cancelar, porque el reintegro se acredita como saldo en tu cuenta.', 'info');
      return;
    }
    if (datosCompra.perfil_id !== usuarioActivo.id) {
      this.modalService.open('No se puede cancelar', 'Esta compra pertenece a otra cuenta.', 'error');
      return;
    }

    this.datosCompraPendiente.set(datosCompra);
    this.modalCancelacionAbierto.set(true);
  }

  // Se ejecuta al confirmar dentro del modal propio
  async ejecutarCancelacion() {
    this.modalCancelacionAbierto.set(false);

    const datosCompra = this.datosCompraPendiente();
    if (!datosCompra) return;

    this.cargando.set(true);

    try {
      const supabase = this.supabaseService.client;

      // Actualizamos el estado de las entradas a cancelada
      const { error: errEntradas } = await supabase
        .from('entradas')
        .update({ estado: 'cancelada' })
        .eq('compra_id', datosCompra.id);

      if (errEntradas) throw errEntradas;

      // El candy no retirado también queda cancelado (el QR deja de servir)
      const { error: errCandy } = await supabase
        .from('detalle_candy')
        .update({ estado: 'cancelado' })
        .eq('compra_id', datosCompra.id)
        .eq('estado', 'pendiente');

      if (errCandy) throw errCandy;

      // Actualizamos el estado de la compra a cancelada
      const { error: errCompra } = await supabase
        .from('compras')
        .update({ estado: 'cancelada' })
        .eq('id', datosCompra.id);

      if (errCompra) throw errCompra;

      // No se devuelve dinero: se acredita todo lo pagado (tarjeta + crédito usado)
      // como crédito a favor, y se descuentan los puntos que había sumado esa compra.
      const reintegro = Number(datosCompra.total_pagado ?? 0) + Number(datosCompra.credito_usado ?? 0);
      const { data: perfil } = await supabase
        .from('perfiles').select('credito_favor, puntos_fidelizacion')
        .eq('id', datosCompra.perfil_id!).single();

      if (perfil) {
        await supabase.from('perfiles').update({
          credito_favor: Number(perfil.credito_favor ?? 0) + reintegro,
          puntos_fidelizacion: Math.max(0, (perfil.puntos_fidelizacion ?? 0) - (datosCompra.puntos_ganados ?? 0))
        }).eq('id', datosCompra.perfil_id!);
      }

      // Se liberaron butacas: si la función tiene lista de espera, se avisa al primero (15 min)
      const funcionId = this.entradas()[0]?.funcion_id;
      if (funcionId) await this.listaEspera.procesar(funcionId);

      this.modalService.open('Cancelación exitosa',
        `Tus entradas fueron canceladas. Se acreditaron $${reintegro.toLocaleString('es-AR')} de crédito en tu cuenta para tu próxima compra.`,
        'success');

      // Redirige a la cartelera de forma inmediata
      this.router.navigate(['/perfil']);

    } catch (error) {
      console.error('Error al cancelar:', error);
      this.modalService.open('Error', 'No pudimos procesar la cancelación. Intenta de nuevo.', 'error');
    } finally {
      this.cargando.set(false);
      this.datosCompraPendiente.set(null);
    }
  }

  // 3. Cancela el diálogo del modal si el usuario se arrepiente
  cancelarProceso() {
    this.modalCancelacionAbierto.set(false);
    this.datosCompraPendiente.set(null);
  }
}
