import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Máscara para tipear fechas y horas a mano, sin calendario ni scroll
 * (pedido del cliente, mail 28/02).
 *   <input appMascaraFecha="fecha">  ->  dd/mm/aaaa
 *   <input appMascaraFecha="hora">   ->  hh:mm
 * Se escriben solo los números; las barras y los dos puntos se agregan solos.
 *
 * Editar una fecha ya cargada: el cursor se queda donde estaba (antes saltaba al final
 * y, al cambiar "10/11" por "28/11", la fecha quedaba mezclada e inválida), y con el
 * campo completo cada número reemplaza al que tiene a la derecha, como en un formulario de papel.
 */
@Directive({
  selector: 'input[appMascaraFecha]',
  standalone: true,
  host: {
    'inputmode': 'numeric',
    'autocomplete': 'off',
    '[attr.placeholder]': "appMascaraFecha() === 'hora' ? 'hh:mm' : 'dd/mm/aaaa'",
    // Un carácter más que el formato: deja escribir sobre un campo completo (después se recorta)
    '[attr.maxlength]': "appMascaraFecha() === 'hora' ? 6 : 11"
  }
})
export class MascaraFechaDirective {
  appMascaraFecha = input<'fecha' | 'hora'>('fecha');

  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private control = inject(NgControl, { optional: true, self: true });

  @HostListener('input', ['$event'])
  onInput(evento?: Event): void {
    const el = this.el.nativeElement;
    const esHora = this.appMascaraFecha() === 'hora';
    const maximo = esHora ? 4 : 8;
    const cursor = el.selectionStart ?? el.value.length;
    // Cuántos números hay antes del cursor: así sabemos dónde dejarlo después de formatear
    let antes = el.value.slice(0, cursor).replace(/\D/g, '').length;
    let digitos = el.value.replace(/\D/g, '');

    // Se escribió con el campo lleno: el número nuevo reemplaza al que estaba a su derecha
    if (digitos.length > maximo) {
      const sobran = digitos.length - maximo;
      digitos = digitos.slice(0, antes) + digitos.slice(antes + sobran);
    }
    digitos = digitos.slice(0, maximo);
    antes = Math.min(antes, digitos.length);

    const valor = esHora ? this.formatearHora(digitos) : this.formatearFecha(digitos);
    el.value = valor;

    // Cursor después del mismo número que antes; si cae justo antes de una barra, la saltea al escribir
    let posicion = 0;
    for (let vistos = 0; posicion < valor.length && vistos < antes; posicion++) {
      if (/\d/.test(valor.charAt(posicion))) vistos++;
    }
    const escribiendo = !(evento as InputEvent | undefined)?.inputType?.startsWith('delete');
    if (escribiendo && /[/:]/.test(valor.charAt(posicion))) posicion++;
    if (document.activeElement === el) el.setSelectionRange(posicion, posicion);

    // Reactive forms: actualizamos el control. ngModel: emitimos ngModelChange con el valor ya formateado.
    this.control?.control?.setValue(valor, { emitEvent: true });
    this.control?.viewToModelUpdate(valor);
  }

  private formatearHora(d: string): string {
    return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  }

  private formatearFecha(d: string): string {
    if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return d;
  }
}
