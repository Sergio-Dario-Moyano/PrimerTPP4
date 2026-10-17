import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReporteService } from '../../../../core/services/reporte.service';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-admin-reportes',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './admin-reportes.component.html',
  styleUrls: ['./admin-reportes.component.css']
})
export class AdminReportesComponent implements OnInit {
  private reporteService = inject(ReporteService);

  cargando = signal<boolean>(true);
  totalFacturado = signal<number>(0);
  totalEntradasVendidas = signal<number>(0);
  peliculasTop = signal<any[]>([]);
  candyTop = signal<any[]>([]);
  comprasRaw = signal<any[]>([]);

  async ngOnInit() {
    await this.cargarReportes();
  }

  async cargarReportes() {
    try {
      this.cargando.set(true);
      const compras = await this.reporteService.getDatosReporteFacturacion();
      const peliculas = await this.reporteService.getPeliculasMasVistas();
      const candy = await this.reporteService.getCandyMasVendido();

      this.comprasRaw.set(compras);

      let recaudacionTotal = 0;
      let entradasTotal = 0;

      compras.forEach(c => {
        recaudacionTotal += Number(c.total_pagado || 0);
        entradasTotal += (c.entradas?.length || 0);
      });

      this.totalFacturado.set(recaudacionTotal);
      this.totalEntradasVendidas.set(entradasTotal);
      this.peliculasTop.set(peliculas);
      this.candyTop.set(candy);

    } catch (err) {
      console.error('Error cargando reportes:', err);
    } finally {
      this.cargando.set(false);
    }
  }

  exportarPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Reporte de Facturacion - CineLanus', 14, 20);

    doc.setFontSize(12);
    doc.text(`Total Facturado: $${this.totalFacturado().toLocaleString()}`, 14, 35);
    doc.text(`Entradas Vendidas: ${this.totalEntradasVendidas()}`, 14, 45);

    doc.text('Peliculas Mas Vistas:', 14, 60);
    let y = 70;
    this.peliculasTop().forEach((p, idx) => {
      doc.text(`${idx + 1}. ${p.titulo} - ${p.entradas_vendidas} entradas`, 20, y);
      y += 10;
    });

    doc.save('reporte-cine-lanus.pdf');
  }

  exportarExcel() {
    let csvContent = 'data:text/csv;charset=utf-8,ID Compra,Fecha,Total Pagado\n';
    this.comprasRaw().forEach(c => {
      csvContent += `${c.id},${c.fecha_compra},${c.total_pagado}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'reporte-facturacion.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
