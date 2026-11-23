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
  // Años como "0268" pasan el formato pero no son fechas reales del cine
  if (Number(m[3]) < 1900) return null;
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

/**
 * Texto de la BD -> Date local. Acepta todo lo que puede devolver Supabase:
 *   "2026-12-25"  ·  "2026-12-25 18:30:00"  ·  "2026-12-25T18:30:00"
 *   "2026-12-25T18:30:00+00:00"  ·  "2026-12-25 18:30:00+00"
 * La app guarda fechas y horas "de pared" (la hora que se ve en el cine), así que
 * se toman tal cual y se ignora cualquier sufijo de zona horaria. Antes, un sufijo
 * como "+00" hacía que la fecha no se pudiera leer (campo vacío al editar) y
 * "+00:00" la corría 3 horas (en Argentina, al día anterior).
 */
export function desdeBD(valor: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(valor?.trim() ?? '');
  if (!m) return null;
  const [, a, mes, d, h = '0', min = '0', seg = '0'] = m;
  const fecha = new Date(Number(a), Number(mes) - 1, Number(d), Number(h), Number(min), Number(seg));
  return isNaN(fecha.getTime()) ? null : fecha;
}

/** Texto de la BD -> "dd/mm/aaaa" (o "" si no hay fecha). Para tablas e inputs. */
export function textoFechaBD(valor: string | null | undefined): string {
  return aTextoFecha(desdeBD(valor));
}

/** Date -> "dd/mm/aaaa" para mostrar en un input. */
export function aTextoFecha(d: Date | null): string {
  return d ? `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

// ---------- Validadores para Reactive Forms ----------

export const fechaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || parsearFecha(c.value) ? null : { fechaInvalida: true };

export const horaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || esHoraValida(c.value) ? null : { horaInvalida: true };

// ---------- Límite de programación ----------

/** Las películas (estreno) y las funciones no se pueden cargar a más de estos días desde hoy. */
export const DIAS_MAXIMOS_PROGRAMACION = 60;

/** Último día permitido: hoy + `dias`, a las 23:59:59 (cuenta el día completo). */
export function fechaLimite(dias = DIAS_MAXIMOS_PROGRAMACION): Date {
  const limite = new Date();
  limite.setDate(limite.getDate() + dias);
  limite.setHours(23, 59, 59, 999);
  return limite;
}

/** true si la fecha cae después del límite de `dias` desde hoy. */
export function superaDiasDesdeHoy(fecha: Date, dias = DIAS_MAXIMOS_PROGRAMACION): boolean {
  return fecha.getTime() > fechaLimite(dias).getTime();
}

/**
 * Rechaza fechas "dd/mm/aaaa" posteriores a hoy + `dias`.
 * Error: { fechaMuyLejana: { dias, limite: 'dd/mm/aaaa' } }.
 */
export function fechaMaximaValidator(dias = DIAS_MAXIMOS_PROGRAMACION): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const fecha = c.value ? parsearFecha(c.value) : null;
    if (!fecha || !superaDiasDesdeHoy(fecha, dias)) return null;
    return { fechaMuyLejana: { dias, limite: aTextoFecha(fechaLimite(dias)) } };
  };
}
