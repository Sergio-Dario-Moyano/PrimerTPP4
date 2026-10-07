import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { QRCodeComponent } from 'angularx-qrcode';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';

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

  // Estados para el modal propio de cancelación
  modalCancelacionAbierto = signal<boolean>(false);
  datosCompraPendiente = signal<any>(null);

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
        this.qrData.set(entradasCasteadas[0].codigo_qr);
        this.codigoManual.set(entradasCasteadas[0].codigo_manual);

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

      if (detalleCandy && detalleCandy.length > 0) {
        const { data: combosCandy } = await supabase
          .from('combos_candy')
          .select('id, nombre');

        const combosArmados = detalleCandy.map(detalle => {
          const comboOriginal = combosCandy?.find(c => c.id === detalle.combo_id);
          return {
            combo_id: detalle.combo_id,
            cantidad: detalle.cantidad,
            nombre: comboOriginal ? comboOriginal.nombre : 'Combo Candy Bar'
          };
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
  intentarCancelar(datosCompra: any) {
    if (!datosCompra) return;

    const usuarioActivo = this.authService.usuarioActual();

    if (!usuarioActivo) {
      this.modalService.open(
        'Beneficio Exclusivo',
        'Para cancelar tu entrada, debes iniciar sesión en tu cuenta de CineLanús.',
        'info'
      );
      this.router.navigate(['/auth'], { queryParams: { vincular_ticket: datosCompra.id } });
      return;
    }

    this.datosCompraPendiente.set(datosCompra);
    this.modalCancelacionAbierto.set(true);
  }

  // Se ejecuta al confirmar dentro del modal propio (YA NO TOCA LOS PUNTOS)
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

      // Actualizamos el estado de la compra a cancelada
      const { error: errCompra } = await supabase
        .from('compras')
        .update({ estado: 'cancelada' })
        .eq('id', datosCompra.id);

      if (errCompra) throw errCompra;

      // Mensaje de éxito e informativo de que la cancelación se procesó
      this.modalService.open('Cancelación Exitosa', 'Tus entradas han sido canceladas correctamente.', 'success');

      // Redirige a la cartelera de forma inmediata
      this.router.navigate(['/']);

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
