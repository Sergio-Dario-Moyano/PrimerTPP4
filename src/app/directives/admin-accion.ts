import { Directive, ElementRef, HostListener, Renderer2, inject, input } from '@angular/core';

@Directive({
  selector: '[appAdminAccion]',
  standalone: true
})
export class AdminAccionDirective {
  private el = inject(ElementRef);
  private renderer = inject(Renderer2);

  tipoAccion = input<string>('pelicula');

  constructor() {
    this.renderer.setStyle(this.el.nativeElement, 'transition', 'all 0.3s ease');
    this.renderer.setStyle(this.el.nativeElement, 'font-weight', 'bold');
  }

  @HostListener('mouseenter') onMouseEnter() {
    this.renderer.setStyle(this.el.nativeElement, 'transform', 'translateY(-2px)');
    this.renderer.setStyle(this.el.nativeElement, 'box-shadow', '0 6px 15px rgba(229, 9, 20, 0.4)');
  }

  @HostListener('mouseleave') onMouseLeave() {
    this.renderer.setStyle(this.el.nativeElement, 'transform', 'translateY(0px)');
    this.renderer.setStyle(this.el.nativeElement, 'box-shadow', 'none');
  }
}
