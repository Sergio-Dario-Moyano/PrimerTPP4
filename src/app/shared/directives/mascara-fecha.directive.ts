import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Máscara para tipear fechas y horas a mano, sin calendario ni scroll
 * (pedido del cliente, mail 28/02).
 *   <input appMascaraFecha="fecha">  ->  dd/mm/aaaa
 *   <input appMascaraFecha="hora">   ->  hh:mm
 * Se escriben solo los números; las barras y los dos puntos se agregan solos.
 */
@Directive({
  selector: 'input[appMascaraFecha]',
  standalone: true,
  host: {
    'inputmode': 'numeric',
    'autocomplete': 'off',
    '[attr.placeholder]': "appMascaraFecha() === 'hora' ? 'hh:mm' : 'dd/mm/aaaa'",
    '[attr.maxlength]': "appMascaraFecha() === 'hora' ? 5 : 10"
  }
})
export class MascaraFechaDirective {
  appMascaraFecha = input<'fecha' | 'hora'>('fecha');

  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private control = inject(NgControl, { optional: true, self: true });

  @HostListener('input')
  onInput(): void {
    const digitos = this.el.nativeElement.value.replace(/\D/g, '');
    let valor: string;

    if (this.appMascaraFecha() === 'hora') {
      const d = digitos.slice(0, 4);
      valor = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
    } else {
      const d = digitos.slice(0, 8);
      if (d.length > 4) valor = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
      else if (d.length > 2) valor = `${d.slice(0, 2)}/${d.slice(2)}`;
      else valor = d;
    }

    this.el.nativeElement.value = valor;
    // Reactive forms: actualizamos el control. ngModel: emitimos ngModelChange con el valor ya formateado.
    this.control?.control?.setValue(valor, { emitEvent: true });
    this.control?.viewToModelUpdate(valor);
  }
}
