import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReporteService, DatosReporte, ItemRanking } from '../../../../core/services/reporte.service';
import { GraficoBarrasComponent } from '../../../../shared/components/grafico-barras/grafico-barras.component';
import { MascaraFechaDirective } from '../../../../shared/directives/mascara-fecha.directive';
import { parsearFecha, aTextoFecha } from '../../../../shared/utils/fechas';

type Periodo = 'semana' | 'mes';

/**
 * Reportes (mails 28/02 y 10/03):
 *  - facturación y entradas vendidas por día (tabla + gráfico), exportables a PDF y Excel
 *  - películas más vistas por semana y por mes
 *  - producto del candy más vendido
 */
@Component({
  selector: 'app-admin-reportes',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, GraficoBarrasComponent, MascaraFechaDirective],
  templateUrl: './admin-reportes.component.html',
  styleUrls: ['../admin-shared.css', './admin-reportes.component.css']
})
export class AdminReportesComponent implements OnInit {
  private reportes = inject(ReporteService);

  // ----- Facturación por día -----
  desdeTexto = signal<string>('');
  hastaTexto = signal<string>('');
  datos = signal<DatosReporte | null>(null);
  cargando = signal<boolean>(true);
  error = signal<string>('');

  // ----- Películas más vistas -----
  periodo = signal<Periodo>('semana');
  /** Desplazamiento respecto del período actual: 0 = esta semana/mes, -1 = anterior… */
  desplazamiento = signal<number>(0);
  masVistas = signal<ItemRanking[]>([]);

  ticketPromedio = computed(() => {
    const d = this.datos();
    return d && d.totalCompras ? d.totalFacturado / d.totalCompras : 0;
  });

  etiquetasDias = computed(() => (this.datos()?.porDia ?? []).map(d => {
    const [, m, dia] = d.fecha.split('-');
    return `${dia}/${m}`;
  }));
  valoresFacturacion = computed(() => (this.datos()?.porDia ?? []).map(d => d.facturacion));
  valoresEntradas = computed(() => (this.datos()?.porDia ?? []).map(d => d.entradas));

  topCandy = computed(() => (this.datos()?.candy ?? []).slice(0, 6));
  topVistas = computed(() => this.masVistas().slice(0, 6));

  nombresTopCandy = computed(() => this.topCandy().map(c => c.nombre));
  cantidadesTopCandy = computed(() => this.topCandy().map(c => c.cantidad));
  nombresTopVistas = computed(() => this.topVistas().map(c => c.nombre));
  cantidadesTopVistas = computed(() => this.topVistas().map(c => c.cantidad));

  /** Rango [inicio, fin] de la semana (lunes a domingo) o mes elegido. */
  rangoVistas = computed<[Date, Date]>(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    if (this.periodo() === 'mes') {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() + this.desplazamiento(), 1);
      return [inicio, new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0)];
    }
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7) + this.desplazamiento() * 7);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return [lunes, domingo];
  });

  async ngOnInit(): Promise<void> {
    this.preset('mes');
    await Promise.all([this.cargarFacturacion(), this.cargarVistas()]);
  }

  // ---------- Facturación ----------

  preset(tipo: '7dias' | 'mes' | 'mesAnterior'): void {
    const hoy = new Date();
    let desde: Date, hasta: Date;
    if (tipo === '7dias') {
      hasta = hoy;
      desde = new Date(hoy); desde.setDate(hoy.getDate() - 6);
    } else if (tipo === 'mes') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      hasta = hoy;
    } else {
      desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    }
    this.desdeTexto.set(aTextoFecha(desde));
    this.hastaTexto.set(aTextoFecha(hasta));
  }

  async aplicarPreset(tipo: '7dias' | 'mes' | 'mesAnterior'): Promise<void> {
    this.preset(tipo);
    await this.cargarFacturacion();
  }

  async cargarFacturacion(): Promise<void> {
    const desde = parsearFecha(this.desdeTexto());
    const hasta = parsearFecha(this.hastaTexto());
    if (!desde || !hasta || hasta < desde) {
      this.error.set('Revisá el rango de fechas (dd/mm/aaaa).');
      return;
    }
    if ((hasta.getTime() - desde.getTime()) / 86400000 > 366) {
      this.error.set('El rango no puede superar un año.');
      return;
    }

    this.error.set('');
    this.cargando.set(true);
    try {
      this.datos.set(await this.reportes.getReporte(desde, hasta));
    } catch (err) {
      console.error(err);
      this.error.set('No se pudo cargar el reporte.');
    } finally {
      this.cargando.set(false);
    }
  }

  // ---------- Películas más vistas ----------

  async cambiarPeriodo(p: Periodo): Promise<void> {
    this.periodo.set(p);
    this.desplazamiento.set(0);
    await this.cargarVistas();
  }

  async moverPeriodo(delta: number): Promise<void> {
    if (this.desplazamiento() + delta > 0) return;
    this.desplazamiento.update(d => d + delta);
    await this.cargarVistas();
  }

  async cargarVistas(): Promise<void> {
    const [desde, hasta] = this.rangoVistas();
    try {
      this.masVistas.set(await this.reportes.getPeliculasMasVistas(desde, hasta));
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- Exportación ----------

  private textoRango(): string {
    return `${this.desdeTexto()} al ${this.hastaTexto()}`;
  }

  async exportarPDF(): Promise<void> {
    const d = this.datos();
    if (!d) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('CineLanús — Reporte de facturación', 14, 18);
    doc.setFontSize(10);
    doc.text(`Período: ${this.textoRango()}`, 14, 25);
    doc.text(
      `Facturado: $ ${Math.round(d.totalFacturado).toLocaleString('es-AR')}   ·   Entradas: ${d.totalEntradas}   ·   Compras: ${d.totalCompras}`,
      14, 31);

    autoTable(doc, {
      startY: 36,
      head: [['Fecha', 'Compras', 'Entradas vendidas', 'Facturación']],
      body: d.porDia.map(f => [this.fechaCorta(f.fecha), f.compras, f.entradas, `$ ${Math.round(f.facturacion).toLocaleString('es-AR')}`]),
      foot: [['Total', d.totalCompras, d.totalEntradas, `$ ${Math.round(d.totalFacturado).toLocaleString('es-AR')}`]],
      headStyles: { fillColor: [30, 30, 30], textColor: [245, 179, 1] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { fontSize: 9 }
    });

    if (d.candy.length) {
      autoTable(doc, {
        head: [['Producto / combo del candy', 'Unidades vendidas']],
        body: d.candy.map(c => [c.nombre, c.cantidad]),
        headStyles: { fillColor: [30, 30, 30], textColor: [245, 179, 1] },
        styles: { fontSize: 9 }
      });
    }

    doc.save(`reporte-facturacion-${this.desdeTexto().replaceAll('/', '-')}_${this.hastaTexto().replaceAll('/', '-')}.pdf`);
  }

  async exportarExcel(): Promise<void> {
    const d = this.datos();
    if (!d) return;
    const { default: ExcelJS } = await import('exceljs');

    const libro = new ExcelJS.Workbook();
    libro.creator = 'CineLanús';

    const hoja = libro.addWorksheet('Facturación diaria');
    hoja.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Compras', key: 'compras', width: 10 },
      { header: 'Entradas vendidas', key: 'entradas', width: 18 },
      { header: 'Facturación ($)', key: 'facturacion', width: 18, style: { numFmt: '"$" #,##0' } }
    ];
    d.porDia.forEach(f => hoja.addRow({ ...f, fecha: this.fechaCorta(f.fecha) }));
    const total = hoja.addRow({ fecha: 'Total', compras: d.totalCompras, entradas: d.totalEntradas, facturacion: d.totalFacturado });
    total.font = { bold: true };
    hoja.getRow(1).font = { bold: true };

    const hojaCandy = libro.addWorksheet('Candy más vendido');
    hojaCandy.columns = [
      { header: 'Producto / combo', key: 'nombre', width: 34 },
      { header: 'Unidades', key: 'cantidad', width: 12 }
    ];
    d.candy.forEach(c => hojaCandy.addRow(c));
    hojaCandy.getRow(1).font = { bold: true };

    const hojaPelis = libro.addWorksheet('Películas más vistas');
    hojaPelis.columns = [
      { header: 'Película', key: 'nombre', width: 34 },
      { header: 'Entradas', key: 'cantidad', width: 12 }
    ];
    this.masVistas().forEach(p => hojaPelis.addRow(p));
    hojaPelis.getRow(1).font = { bold: true };

    const buffer = await libro.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-facturacion-${this.desdeTexto().replaceAll('/', '-')}_${this.hastaTexto().replaceAll('/', '-')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  fechaCorta(iso: string): string {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
}
