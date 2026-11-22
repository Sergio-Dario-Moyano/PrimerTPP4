import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Campos numéricos del panel admin: solo números mayores a 0.
 * Si el campo está vacío no da error (de eso se encarga Validators.required).
 *   - { noNumerico: true }  si el valor tiene letras o no es un número
 *   - { noPositivo: true }  si es 0 o negativo
 */
export const numeroPositivoValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const valor = c.value;
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  if (!Number.isFinite(n)) return { noNumerico: true };
  return n > 0 ? null : { noPositivo: true };
};

/** Solo números enteros (sin decimales). Usar junto con numeroPositivoValidator. */
export const enteroValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const valor = c.value;
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) && !Number.isInteger(n) ? { noEntero: true } : null;
};
