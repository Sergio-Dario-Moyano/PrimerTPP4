import { Directive, ElementRef, HostListener, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Máscara para los datos de la tarjeta en el checkout.
 *   <input appMascaraTarjeta="numero">       ->  1234 5678 9012 3456  (espacio cada 4 dígitos)
 *   <input appMascaraTarjeta="vencimiento">  ->  MM/AA                (la barra se agrega sola)
 * Se escriben solo los números; los separadores se agregan automáticamente.
 */
@Directive({
  selector: 'input[appMascaraTarjeta]',
  standalone: true,
  host: {
    'inputmode': 'numeric',
    'autocomplete': 'off',
    '[attr.placeholder]': "appMascaraTarjeta() === 'vencimiento' ? 'MM/AA' : '1234 5678 9012 3456'",
    '[attr.maxlength]': "appMascaraTarjeta() === 'vencimiento' ? 5 : 19"
  }
})
export class MascaraTarjetaDirective {
  appMascaraTarjeta = input<'numero' | 'vencimiento'>('numero');

  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private control = inject(NgControl, { optional: true, self: true });

  @HostListener('input', ['$event'])
  onInput(evento: Event): void {
    const input = this.el.nativeElement;
    const digitos = input.value.replace(/\D/g, '');
    let valor: string;

    if (this.appMascaraTarjeta() === 'vencimiento') {
      const d = digitos.slice(0, 4);
      // Al borrar (backspace sobre la barra) no la volvemos a poner
      const borrando = (evento as InputEvent).inputType?.startsWith('delete');
      if (d.length > 2) valor = `${d.slice(0, 2)}/${d.slice(2)}`;
      else if (d.length === 2 && !borrando) valor = `${d}/`;
      else valor = d;
    } else {
      valor = digitos.slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    }

    input.value = valor;
    this.control?.control?.setValue(valor, { emitEvent: true });
    this.control?.viewToModelUpdate(valor);
  }
}
