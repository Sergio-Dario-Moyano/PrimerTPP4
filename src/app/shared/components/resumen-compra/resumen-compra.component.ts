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

  pelicula = input.required<{ titulo: string; formato: string; posterUrl: string }>();
  funcion = input.required<{ cine: string; sala: string; fechaFormateada: string; horaFormateada: string }>();
  butacas = input<string[]>([]);

  entradas = input<{ cantidad: number; tipo: string; precioTotal: number }[]>([]);
  cargoServicioEntradas = input<number>(0);

  deshabilitarContinuar = input<boolean>(false);
  textoBoton = input<string>('Continuar');

  onContinuar = output<void>();

  granTotal = computed(() => {
    const subtotalEntradas = this.entradas().reduce((sum, e) => sum + e.precioTotal, 0);
    const subtotalCandy = this.candy().reduce((sum, c) => sum + c.precioTotal, 0);

    return subtotalEntradas + this.cargoServicioEntradas() + subtotalCandy + this.cargoServicioCandy();
  });
}
