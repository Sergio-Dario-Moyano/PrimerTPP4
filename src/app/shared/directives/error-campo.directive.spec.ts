import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ErrorCampoDirective } from './error-campo.directive';

@Component({
  imports: [ReactiveFormsModule, ErrorCampoDirective],
  template: `
    <form [formGroup]="form">
      <label for="nombre">Nombre</label>
      <input id="nombre" formControlName="nombre">
      <label for="cod">Código</label>
      <input id="cod" formControlName="codigo" errorPattern="Solo letras.">
      <label for="opc">Opcional</label>
      <input id="opc" formControlName="opcional">
    </form>`
})
class Host {
  form = new FormGroup({
    nombre: new FormControl('', Validators.required),
    codigo: new FormControl('', [Validators.required, Validators.pattern(/^[a-z]+$/)]),
    opcional: new FormControl('')
  });
}

describe('ErrorCampoDirective', () => {
  it('marca obligatorios y muestra mensajes al tocar', async () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges(); await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    const labels = Array.from(el.querySelectorAll('label')).map(l => l.textContent);
    expect(labels).toEqual(['Nombre *', 'Código *', 'Opcional']);
    expect(el.querySelectorAll('.form-error').length).toBe(0);

    f.componentInstance.form.markAllAsTouched();
    f.detectChanges();
    expect(Array.from(el.querySelectorAll('.form-error')).map(e => e.textContent))
      .toEqual(['Este campo es obligatorio.', 'Este campo es obligatorio.']);

    f.componentInstance.form.controls.codigo.setValue('A1');
    f.detectChanges();
    expect(el.querySelector('#cod + .form-error')?.textContent).toBe('Solo letras.');

    f.componentInstance.form.controls.nombre.setValue('Ana');
    f.detectChanges();
    expect(el.querySelector('#nombre + .form-error')).toBeNull();

    f.componentInstance.form.controls.opcional.addValidators(Validators.required);
    f.componentInstance.form.controls.opcional.updateValueAndValidity();
    f.detectChanges();
    expect(el.querySelector('label[for=opc]')?.textContent).toBe('Opcional *');
  });
});
