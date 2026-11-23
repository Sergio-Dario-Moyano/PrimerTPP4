import { Directive, ElementRef, HostListener, booleanAttribute, inject, input } from '@angular/core';

/**
 * Se aplica sola a todo <input type="number"> del componente que la importe:
 * impide tipear o pegar letras, signos (+, -, e) y, si no se pide, decimales.
 * Así el campo nunca recibe 0 por "-0", ni negativos, ni "1e5".
 * El mínimo real (mayor a 0) lo valida numeroPositivoValidator en el formulario.
 *
 *   <input type="number" formControlName="duracion_minutos">              -> solo enteros
 *   <input type="number" formControlName="precio_base" conDecimales>     -> admite "1500.50"
 *   <input type="number" formControlName="costo_puntos" permitirCero>    -> 0 es un valor válido
 */
@Directive({
  selector: 'input[type=number]',
  standalone: true,
  host: {
    '[attr.inputmode]': "conDecimales() ? 'decimal' : 'numeric'",
    '[attr.min]': "permitirCero() ? '0' : (conDecimales() ? '0.01' : '1')",
    '[attr.step]': "conDecimales() ? '0.01' : '1'"
  }
})
export class SoloNumerosDirective {
  conDecimales = input(false, { transform: booleanAttribute });
  /** Para campos donde 0 tiene un significado (ej. "0 puntos = no se puede canjear"). */
  permitirCero = input(false, { transform: booleanAttribute });

  private el = inject<ElementRef<HTMLInputElement>>(ElementRef);

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    // Atajos (copiar, pegar, seleccionar todo) y teclas de control (Tab, flechas, borrar)
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (/\d/.test(e.key)) return;
    if (e.key === '.' && this.conDecimales() && !this.el.nativeElement.value.includes('.')) return;
    e.preventDefault();
  }

  @HostListener('paste', ['$event'])
  onPaste(e: ClipboardEvent): void {
    const texto = (e.clipboardData?.getData('text') ?? '').trim();
    const valido = this.conDecimales() ? /^\d+(\.\d+)?$/ : /^\d+$/;
    if (!valido.test(texto)) e.preventDefault();
  }

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent): void {
    e.preventDefault();
  }

  /** Evita que la rueda del mouse cambie el valor sin querer (y lo lleve a 0 o negativo). */
  @HostListener('wheel', ['$event'])
  onWheel(e: WheelEvent): void {
    if (document.activeElement === this.el.nativeElement) e.preventDefault();
  }
}
