import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validador personalizado que compara el valor del control actual (Confirmar Clave)
 * con el valor de un control de referencia (Clave Original).
 */
export function clavesCoincidenValidator(controlOriginal: AbstractControl): ValidatorFn {
  return (controlConfirmar: AbstractControl): ValidationErrors | null => {
    if (!controlOriginal || !controlConfirmar.value) {
      return null;
    }

    const clave = controlOriginal.value;
    const confirmar = controlConfirmar.value;

    return clave === confirmar ? null : { losControlesNoCoinciden: true };
  };
}

/**
 * Validador personalizado que verifica si la fecha ingresada
 * corresponde a una persona mayor de 18 años, parseando el formato "DD / MM / AAAA".
 */
export function mayorDeEdadValidator(control: AbstractControl): ValidationErrors | null {
  // Esperamos a que la fecha esté completa con sus 14 caracteres (ej: "01 / 02 / 2000")
  if (!control.value || control.value.length < 14) {
    return null;
  }

  // Separamos el string basándonos en nuestra máscara
  const partes = control.value.split(' / ');
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1; // En Date de JS, enero es 0 y diciembre es 11
  const anio = parseInt(partes[2], 10);

  const fechaNacimiento = new Date(anio, mes, dia);
  const hoy = new Date();

  let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
  const diferenciaMeses = hoy.getMonth() - fechaNacimiento.getMonth();

  // Si aún no ha llegado su mes o día de cumpleaños este año, restamos 1 a la edad
  if (diferenciaMeses < 0 || (diferenciaMeses === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
    edad--;
  }

  return edad >= 18 ? null : { menorDeEdad: true };
}

/** Grupos sanguíneos válidos (sistema ABO + factor Rh). */
export const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

/** Letras (con acentos y ñ), espacios, apóstrofo y guion. Sin números ni símbolos. */
const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;

/**
 * Solo letras: para nombre, apellido y color de ojos.
 * Devuelve { soloLetras: true } si hay números o símbolos.
 */
export function soloLetrasValidator(control: AbstractControl): ValidationErrors | null {
  const valor = (control.value ?? '').toString().trim();
  if (!valor) return null; // de "vacío" se encarga Validators.required
  return SOLO_LETRAS.test(valor) ? null : { soloLetras: true };
}

/** Tipo de sangre: debe ser uno de TIPOS_SANGRE. */
export function tipoSangreValidator(control: AbstractControl): ValidationErrors | null {
  const valor = (control.value ?? '').toString().trim().toUpperCase();
  if (!valor) return null;
  return (TIPOS_SANGRE as readonly string[]).includes(valor) ? null : { tipoSangreInvalido: true };
}

/** Número entero (sin decimales). */
export function enteroValidator(control: AbstractControl): ValidationErrors | null {
  const valor = control.value;
  if (valor === null || valor === undefined || valor === '') return null;
  return Number.isInteger(Number(valor)) ? null : { noEntero: true };
}

/**
 * Fecha de nacimiento con la máscara "DD / MM / AAAA".
 * Errores posibles:
 *  - fechaIncompleta: faltan dígitos
 *  - fechaInexistente: p. ej. 31/02 o mes 13
 *  - fechaNoPasada: es hoy o una fecha futura (tiene que ser anterior al día del registro)
 *  - fechaMuyAntigua: más de 120 años
 */
export function fechaNacimientoValidator(control: AbstractControl): ValidationErrors | null {
  const valor: string = control.value ?? '';
  if (!valor) return null;

  const partes = valor.split(' / ');
  if (partes.length !== 3 || partes[2].length !== 4) return { fechaIncompleta: true };

  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1;
  const anio = parseInt(partes[2], 10);
  const fecha = new Date(anio, mes, dia);

  // new Date "corrige" fechas imposibles (31/02 -> 03/03): si cambió, la fecha no existe
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes || fecha.getDate() !== dia) {
    return { fechaInexistente: true };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha >= hoy) return { fechaNoPasada: true };

  const limite = new Date(hoy.getFullYear() - 120, hoy.getMonth(), hoy.getDate());
  if (fecha < limite) return { fechaMuyAntigua: true };

  return null;
}
