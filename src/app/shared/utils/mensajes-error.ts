import { ValidationErrors } from '@angular/forms';

/**
 * Texto que se muestra debajo de un campo para cada error de validación.
 * Lo usan el formulario de registro y todos los formularios del panel admin.
 */
export const MENSAJES_ERROR: Record<string, (detalle: any) => string> = {
  required: () => 'Este campo es obligatorio.',
  email: () => 'Ingresá un correo válido (ej. nombre@mail.com).',
  minlength: e => `Debe tener al menos ${e.requiredLength} caracteres.`,
  maxlength: e => `No puede superar los ${e.requiredLength} caracteres.`,
  min: e => `Debe ser mayor o igual a ${e.min}.`,
  max: e => `Debe ser menor o igual a ${e.max}.`,
  pattern: () => 'El formato no es válido.',
  soloLetras: () => 'Solo se permiten letras (sin números ni símbolos).',
  tipoSangreInvalido: () => 'Elegí un tipo de sangre válido.',
  noEntero: () => 'Ingresá un número entero, sin decimales.',
  fechaIncompleta: () => 'Completá la fecha con el formato DD / MM / AAAA.',
  fechaInexistente: () => 'Esa fecha no existe.',
  fechaNoPasada: () => 'La fecha de nacimiento tiene que ser anterior a hoy.',
  fechaMuyAntigua: () => 'Ingresá una fecha de nacimiento real.',
  fechaInvalida: () => 'Fecha inválida (dd/mm/aaaa).',
  horaInvalida: () => 'Hora inválida (hh:mm).',
  losControlesNoCoinciden: () => 'Las contraseñas no coinciden.',
};

/** Mensaje del primer error del control, o null si no tiene errores. */
export function mensajeDeError(errores: ValidationErrors | null, mensajePattern?: string): string | null {
  if (!errores) return null;
  const [clave, detalle] = Object.entries(errores)[0];
  if (clave === 'pattern' && mensajePattern) return mensajePattern;
  return MENSAJES_ERROR[clave]?.(detalle) ?? 'El valor ingresado no es válido.';
}
