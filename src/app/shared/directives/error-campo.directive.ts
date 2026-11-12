import { DestroyRef, Directive, ElementRef, Injector, OnInit, Renderer2, afterNextRender, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl, Validators } from '@angular/forms';
import { mensajeDeError } from '../utils/mensajes-error';

/**
 * Se aplica sola a cada campo con formControlName del componente que la importe:
 *  - agrega un " *" rojo al <label for="..."> si el campo es obligatorio
 *  - muestra debajo del campo el mensaje de error cuando el usuario lo tocó
 *    o intentó guardar (markAllAsTouched).
 * Si el campo pasa a ser obligatorio u opcional en runtime, el asterisco se actualiza.
 *
 *   <input id="codigo" formControlName="codigo" errorPattern="Solo letras, números, - y _.">
 */
@Directive({
  selector: '[formControlName]',
  standalone: true
})
export class ErrorCampoDirective implements OnInit {
  /** Mensaje propio para el error "pattern" (el genérico dice "El formato no es válido"). */
  errorPattern = input<string>();

  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private renderer = inject(Renderer2);
  private destroyRef = inject(DestroyRef);
  private ngControl = inject(NgControl, { self: true });
  private injector = inject(Injector);

  /** true para componentes propios (p. ej. <app-image-dropzone>): el mensaje va adentro del componente. */
  private get esComponente(): boolean {
    return this.el.nativeElement.tagName.startsWith('APP-');
  }

  private mensaje: HTMLElement | null = null;
  private asterisco: HTMLElement | null = null;

  ngOnInit(): void {
    const control = this.ngControl.control;
    const host = this.el.nativeElement;
    // Los checkbox no llevan mensaje (siempre tienen un valor válido)
    if (!control || (host instanceof HTMLInputElement && host.type === 'checkbox')) return;

    this.actualizar();
    // Los componentes propios terminan de dibujar su etiqueta después: repetimos una vez
    afterNextRender(() => this.actualizar(), { injector: this.injector });
    control.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.actualizar());
  }

  private actualizar(): void {
    const control = this.ngControl.control!;
    this.marcarObligatorio(control.hasValidator(Validators.required));

    const texto = control.touched ? mensajeDeError(control.errors, this.errorPattern()) : null;
    if (texto) {
      if (!this.mensaje) {
        this.mensaje = this.renderer.createElement('span');
        this.renderer.addClass(this.mensaje, 'form-error');
        this.renderer.setAttribute(this.mensaje, 'role', 'alert');
        const host = this.el.nativeElement;
        if (this.esComponente) this.renderer.appendChild(host, this.mensaje);
        else this.renderer.insertBefore(host.parentNode, this.mensaje, host.nextSibling);
      }
      this.mensaje!.textContent = texto;
      this.renderer.addClass(this.el.nativeElement, 'campo-invalido');
    } else {
      if (this.mensaje) {
        this.renderer.removeChild(this.mensaje.parentNode, this.mensaje);
        this.mensaje = null;
      }
      this.renderer.removeClass(this.el.nativeElement, 'campo-invalido');
    }
  }

  private marcarObligatorio(obligatorio: boolean): void {
    const host = this.el.nativeElement;
    const label = this.esComponente
      ? host.querySelector<HTMLElement>('.dropzone__etiqueta, label')
      : host.id ? host.closest('form')?.querySelector<HTMLElement>(`label[for="${host.id}"]`) : null;
    if (!label) return;

    if (obligatorio && !this.asterisco) {
      this.asterisco = this.renderer.createElement('span');
      this.renderer.addClass(this.asterisco, 'form-obligatorio');
      this.renderer.setAttribute(this.asterisco, 'aria-hidden', 'true');
      this.asterisco!.textContent = ' *';
      this.renderer.appendChild(label, this.asterisco);
    } else if (!obligatorio && this.asterisco) {
      this.renderer.removeChild(label, this.asterisco);
      this.asterisco = null;
    }
  }
}
