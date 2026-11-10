import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Utilidades de fecha/hora para inputs TIPEADOS (sin calendario).
 * Formato de pantalla: "dd/mm/aaaa" y "hh:mm".
 * Formato de la BD (timestamp sin zona): "aaaa-mm-dd hh:mm:00".
 */

const RE_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "25/12/2026" -> Date (local) o null si es inválida (ej. 31/02). */
export function parsearFecha(texto: string): Date | null {
  const m = RE_FECHA.exec(texto?.trim() ?? '');
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  // Si JS "corrigió" el día (31/02 -> 03/03) la fecha no existe
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return d;
}

/** "18:30" válido. */
export function esHoraValida(texto: string): boolean {
  return RE_HORA.test(texto?.trim() ?? '');
}

/** Combina fecha "dd/mm/aaaa" + hora "hh:mm" en un Date local. */
export function combinarFechaHora(fecha: string, hora: string): Date | null {
  const d = parsearFecha(fecha);
  if (!d || !esHoraValida(hora)) return null;
  const [h, min] = hora.split(':').map(Number);
  d.setHours(h, min, 0, 0);
  return d;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** Date -> "aaaa-mm-dd hh:mm:00" para guardar en un timestamp sin zona horaria. */
export function aTimestampBD(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}:00`;
}

/** Date -> "aaaa-mm-dd" (columna date). */
export function aFechaBD(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** Texto de la BD ("2026-12-25" o "2026-12-25 18:30:00") -> Date local. */
export function desdeBD(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const limpio = valor.length === 10 ? `${valor}T00:00:00` : valor.replace(' ', 'T');
  const d = new Date(limpio);
  return isNaN(d.getTime()) ? null : d;
}

/** Date -> "dd/mm/aaaa" para mostrar en un input. */
export function aTextoFecha(d: Date | null): string {
  return d ? `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** Date -> "hh:mm". */
export function aTextoHora(d: Date | null): string {
  return d ? `${dos(d.getHours())}:${dos(d.getMinutes())}` : '';
}

// ---------- Validadores para Reactive Forms ----------

export const fechaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || parsearFecha(c.value) ? null : { fechaInvalida: true };

export const horaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || esHoraValida(c.value) ? null : { horaInvalida: true };
