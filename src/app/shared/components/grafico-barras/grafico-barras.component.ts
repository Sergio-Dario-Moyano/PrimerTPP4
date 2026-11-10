import { Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const ACENTO = '#f5b301';
const ACENTO_SUAVE = 'rgba(245, 179, 1, 0.45)';
const TINTA = '#b3b3b3';
const GRILLA = 'rgba(255, 255, 255, 0.06)';

/**
 * Gráfico de barras de UNA serie (Chart.js). Un solo color de acento: sin leyenda,
 * el título del bloque nombra la serie. Tooltip al pasar el mouse.
 *   horizontal = true para rankings (nombres largos a la izquierda).
 *   destacarPrimero = true resalta la barra #1 (ej. "producto más vendido").
 */
@Component({
  selector: 'app-grafico-barras',
  standalone: true,
  template: `<div class="grafico" [style.height.px]="alto()"><canvas #lienzo [attr.aria-label]="descripcion()" role="img"></canvas></div>`,
  styles: [`.grafico { position: relative; width: 100%; }`]
})
export class GraficoBarrasComponent implements OnDestroy {
  etiquetas = input.required<string[]>();
  valores = input.required<number[]>();
  horizontal = input<boolean>(false);
  destacarPrimero = input<boolean>(false);
  formatoMoneda = input<boolean>(false);
  unidad = input<string>('');
  alto = input<number>(260);
  descripcion = input<string>('Gráfico de barras');

  private lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private grafico: Chart | null = null;

  constructor() {
    effect(() => this.dibujar());
  }

  private formatear(v: number): string {
    return this.formatoMoneda()
      ? `$ ${Math.round(v).toLocaleString('es-AR')}`
      : `${v.toLocaleString('es-AR')}${this.unidad() ? ' ' + this.unidad() : ''}`;
  }

  private dibujar(): void {
    const etiquetas = this.etiquetas();
    const valores = this.valores();
    const horizontal = this.horizontal();
    const colores = valores.map((_, i) => (this.destacarPrimero() && i > 0 ? ACENTO_SUAVE : ACENTO));

    this.grafico?.destroy();
    this.grafico = new Chart(this.lienzo().nativeElement, {
      type: 'bar',
      data: {
        labels: etiquetas,
        datasets: [{
          data: valores,
          backgroundColor: colores,
          hoverBackgroundColor: ACENTO,
          borderRadius: 4,
          borderSkipped: 'start',
          maxBarThickness: 36
        }]
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111', borderColor: '#333', borderWidth: 1,
            titleColor: '#fff', bodyColor: '#ddd', padding: 10, displayColors: false,
            callbacks: { label: ctx => this.formatear(Number(ctx.raw)) }
          }
        },
        scales: {
          x: {
            grid: { color: horizontal ? GRILLA : 'transparent' },
            ticks: { color: TINTA, callback: horizontal ? (v => this.formatear(Number(v))) : undefined },
            beginAtZero: true
          },
          y: {
            grid: { color: horizontal ? 'transparent' : GRILLA },
            ticks: { color: TINTA, callback: horizontal ? undefined : (v => this.formatear(Number(v))) },
            beginAtZero: true
          }
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.grafico?.destroy();
  }
}
