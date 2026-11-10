import { Component, input, output, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  imports: [DecimalPipe],
  selector: 'app-resumen-compra',
  styleUrl: './resumen-compra.component.css',
  templateUrl: './resumen-compra.component.html',
})
export class ResumenCompraComponent {

  candy = input<{ nombre: string; cantidad: number; precioTotal: number }[]>([]);
  cargoServicioCandy = input<number>(0);

  /** Compra solo de candy: no muestra película, función ni asientos. */
  soloCandy = input<boolean>(false);

  pelicula = input<{ titulo: string; formato: string; posterUrl: string }>({ titulo: '', formato: '', posterUrl: '' });
  funcion = input<{ cine: string; sala: string; fechaFormateada: string; horaFormateada: string }>({ cine: '', sala: '', fechaFormateada: '', horaFormateada: '' });
  butacas = input<string[]>([]);

  entradas = input<{ cantidad: number; tipo: string; precioTotal: number }[]>([]);
  cargoServicioEntradas = input<number>(0);

  /** Descuentos a restar (ej. entradas incluidas en combos). */
  descuentos = input<{ concepto: string; monto: number }[]>([]);

  deshabilitarContinuar = input<boolean>(false);
  textoBoton = input<string>('Continuar');

  onContinuar = output<void>();

  granTotal = computed(() => {
    const subtotalEntradas = this.entradas().reduce((sum, e) => sum + e.precioTotal, 0);
    const subtotalCandy = this.candy().reduce((sum, c) => sum + c.precioTotal, 0);

    const descuentos = this.descuentos().reduce((sum, d) => sum + d.monto, 0);

    return subtotalEntradas + this.cargoServicioEntradas() + subtotalCandy + this.cargoServicioCandy() - descuentos;
  });
}
