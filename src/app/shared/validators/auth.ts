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
