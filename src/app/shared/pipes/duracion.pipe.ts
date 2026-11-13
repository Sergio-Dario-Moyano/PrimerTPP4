import { Pipe, PipeTransform } from '@angular/core';

/**
 * Muestra una duración en minutos como horas y minutos.
 *   {{ 125 | duracion }}  ->  "2 h 05 min"
 *   {{ 45 | duracion }}   ->  "45 min"
 * Es un pipe puro: Angular solo lo vuelve a ejecutar cuando cambia el valor.
 */
@Pipe({ name: 'duracion' })
export class DuracionPipe implements PipeTransform {
  transform(minutos: number | null | undefined): string {
    if (minutos == null || isNaN(minutos) || minutos <= 0) return '';
    const total = Math.round(minutos);
    const horas = Math.floor(total / 60);
    const resto = total % 60;
    return horas > 0 ? `${horas} h ${String(resto).padStart(2, '0')} min` : `${resto} min`;
  }
}
