import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { LogService } from './log.service';
import { aTimestampBD, desdeBD } from '../../shared/utils/fechas';

/** Margen obligatorio entre el fin de una función y el inicio de la siguiente (mail 01/01). */
export const MARGEN_LIMPIEZA_MIN = 30;

export interface Ocupacion { sala_id: number; inicio: Date; fin: Date; }

export interface ResultadoProgramacion {
  creadas: { fecha: Date; sala: string }[];
  rechazadas: { fecha: Date; motivo: string }[];
}

export interface DatosFuncion {
  peliculaId: string;
  fechas: Date[];
  formato: string;
  idioma: string;
}

/**
 * Programación de funciones con asignación AUTOMÁTICA de sala (mail 06/02):
 * nunca dos funciones en la misma sala al mismo tiempo, contando la duración
 * de la película + 30 minutos de margen.
 */
@Service()
export class FuncionesService {
  private supabase = inject(SupabaseService).client;
  private log = inject(LogService);

  /** Devuelve la primera sala libre para [inicio, fin), o null si están todas ocupadas. */
  static buscarSalaLibre(
    salas: { id: number }[],
    ocupaciones: Ocupacion[],
    inicio: Date,
    fin: Date
  ): number | null {
    for (const sala of salas) {
      const cruza = ocupaciones.some(o =>
        o.sala_id === sala.id && inicio < o.fin && fin > o.inicio
      );
      if (!cruza) return sala.id;
    }
    return null;
  }

  async programar(datos: DatosFuncion): Promise<ResultadoProgramacion> {
    const { data: peli, error: errPeli } = await this.supabase
      .from('peliculas').select('titulo, duracion_minutos').eq('id', datos.peliculaId).single();
    if (errPeli || !peli) throw new Error('No se encontró la película seleccionada.');

    const { data: salas, error: errSalas } = await this.supabase
      .from('salas').select('id, nombre').order('id');
    if (errSalas || !salas?.length) throw new Error('No hay salas cargadas.');

    const { data: existentes, error: errFunc } = await this.supabase
      .from('funciones').select('sala_id, fecha_hora, peliculas ( duracion_minutos )')
      .neq('estado', 'cancelada'); // una función cancelada libera la sala
    if (errFunc) throw errFunc;

    // Bloque ocupado de cada función existente = duración + margen
    const ocupaciones: Ocupacion[] = (existentes ?? []).map(f => {
      const inicio = desdeBD(f.fecha_hora)!;
      const duracion = (f.peliculas as unknown as { duracion_minutos: number } | null)?.duracion_minutos ?? 120;
      return { sala_id: f.sala_id, inicio, fin: new Date(inicio.getTime() + (duracion + MARGEN_LIMPIEZA_MIN) * 60000) };
    });

    const resultado: ResultadoProgramacion = { creadas: [], rechazadas: [] };
    const ahora = new Date();
    const bloqueMin = peli.duracion_minutos + MARGEN_LIMPIEZA_MIN;

    for (const fecha of datos.fechas) {
      if (fecha <= ahora) {
        resultado.rechazadas.push({ fecha, motivo: 'La fecha ya pasó' });
        continue;
      }

      const fin = new Date(fecha.getTime() + bloqueMin * 60000);
      const salaId = FuncionesService.buscarSalaLibre(salas, ocupaciones, fecha, fin);

      if (salaId == null) {
        resultado.rechazadas.push({ fecha, motivo: 'Todas las salas están ocupadas en ese horario' });
        continue;
      }

      const { data: nueva, error } = await this.supabase.from('funciones').insert([{
        pelicula_id: datos.peliculaId,
        sala_id: salaId,
        fecha_hora: aTimestampBD(fecha),
        formato: datos.formato,
        idioma: datos.idioma
      }]).select('id').single();

      if (error) {
        resultado.rechazadas.push({ fecha, motivo: error.message });
        continue;
      }

      // La función nueva también ocupa la sala para las siguientes de este mismo lote
      ocupaciones.push({ sala_id: salaId, inicio: fecha, fin });
      const sala = salas.find(s => s.id === salaId)!.nombre;
      resultado.creadas.push({ fecha, sala });

      await this.log.registrar('CREAR_FUNCION', 'funciones', nueva.id,
        `Se programó "${peli.titulo}" (${datos.formato}, ${datos.idioma}) en ${sala} el ${aTimestampBD(fecha).slice(0, 16)}`);
    }

    return resultado;
  }

  /**
   * Genera las fechas de una programación recurrente.
   * dias: 0 = domingo … 6 = sábado (como Date.getDay()).
   */
  static generarFechasRecurrentes(desde: Date, hasta: Date, dias: number[], hora: string): Date[] {
    const [h, m] = hora.split(':').map(Number);
    const fechas: Date[] = [];
    const cursor = new Date(desde);
    cursor.setHours(0, 0, 0, 0);
    const limite = new Date(hasta);
    limite.setHours(23, 59, 59, 999);

    while (cursor <= limite) {
      if (dias.includes(cursor.getDay())) {
        const f = new Date(cursor);
        f.setHours(h, m, 0, 0);
        fechas.push(f);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return fechas;
  }
}














// import { Service, inject } from '@angular/core';
// import { SupabaseService } from './supabase';
// import { LogService } from './log.service';
// import { aTimestampBD, desdeBD } from '../../shared/utils/fechas';

// /** Margen obligatorio entre el fin de una función y el inicio de la siguiente (mail 01/01). */
// export const MARGEN_LIMPIEZA_MIN = 30;

// export interface Ocupacion { sala_id: number; inicio: Date; fin: Date; }

// export interface ResultadoProgramacion {
//   creadas: { fecha: Date; sala: string }[];
//   rechazadas: { fecha: Date; motivo: string }[];
// }

// export interface DatosFuncion {
//   peliculaId: string;
//   fechas: Date[];
//   formato: string;
//   idioma: string;
// }

// /**
//  * Programación de funciones con asignación AUTOMÁTICA de sala (mail 06/02):
//  * nunca dos funciones en la misma sala al mismo tiempo, contando la duración
//  * de la película + 30 minutos de margen.
//  */
// @Service()
// export class FuncionesService {
//   private supabase = inject(SupabaseService).client;
//   private log = inject(LogService);

//   /** Devuelve la primera sala libre para [inicio, fin), o null si están todas ocupadas. */
//   static buscarSalaLibre(
//     salas: { id: number }[],
//     ocupaciones: Ocupacion[],
//     inicio: Date,
//     fin: Date
//   ): number | null {
//     for (const sala of salas) {
//       const cruza = ocupaciones.some(o =>
//         o.sala_id === sala.id && inicio < o.fin && fin > o.inicio
//       );
//       if (!cruza) return sala.id;
//     }
//     return null;
//   }

//   async programar(datos: DatosFuncion): Promise<ResultadoProgramacion> {
//     const { data: peli, error: errPeli } = await this.supabase
//       .from('peliculas').select('titulo, duracion_minutos').eq('id', datos.peliculaId).single();
//     if (errPeli || !peli) throw new Error('No se encontró la película seleccionada.');

//     const { data: salas, error: errSalas } = await this.supabase
//       .from('salas').select('id, nombre').order('id');
//     if (errSalas || !salas?.length) throw new Error('No hay salas cargadas.');

//     const { data: existentes, error: errFunc } = await this.supabase
//       .from('funciones').select('sala_id, fecha_hora, peliculas ( duracion_minutos )');
//     if (errFunc) throw errFunc;

//     // Bloque ocupado de cada función existente = duración + margen
//     const ocupaciones: Ocupacion[] = (existentes ?? []).map(f => {
//       const inicio = desdeBD(f.fecha_hora)!;
//       const duracion = (f.peliculas as unknown as { duracion_minutos: number } | null)?.duracion_minutos ?? 120;
//       return { sala_id: f.sala_id, inicio, fin: new Date(inicio.getTime() + (duracion + MARGEN_LIMPIEZA_MIN) * 60000) };
//     });

//     const resultado: ResultadoProgramacion = { creadas: [], rechazadas: [] };
//     const ahora = new Date();
//     const bloqueMin = peli.duracion_minutos + MARGEN_LIMPIEZA_MIN;

//     for (const fecha of datos.fechas) {
//       if (fecha <= ahora) {
//         resultado.rechazadas.push({ fecha, motivo: 'La fecha ya pasó' });
//         continue;
//       }

//       const fin = new Date(fecha.getTime() + bloqueMin * 60000);
//       const salaId = FuncionesService.buscarSalaLibre(salas, ocupaciones, fecha, fin);

//       if (salaId == null) {
//         resultado.rechazadas.push({ fecha, motivo: 'Todas las salas están ocupadas en ese horario' });
//         continue;
//       }

//       const { data: nueva, error } = await this.supabase.from('funciones').insert([{
//         pelicula_id: datos.peliculaId,
//         sala_id: salaId,
//         fecha_hora: aTimestampBD(fecha),
//         formato: datos.formato,
//         idioma: datos.idioma
//       }]).select('id').single();

//       if (error) {
//         resultado.rechazadas.push({ fecha, motivo: error.message });
//         continue;
//       }

//       // La función nueva también ocupa la sala para las siguientes de este mismo lote
//       ocupaciones.push({ sala_id: salaId, inicio: fecha, fin });
//       const sala = salas.find(s => s.id === salaId)!.nombre;
//       resultado.creadas.push({ fecha, sala });

//       await this.log.registrar('CREAR_FUNCION', 'funciones', nueva.id,
//         `Se programó "${peli.titulo}" (${datos.formato}, ${datos.idioma}) en ${sala} el ${aTimestampBD(fecha).slice(0, 16)}`);
//     }

//     return resultado;
//   }

//   /**
//    * Genera las fechas de una programación recurrente.
//    * dias: 0 = domingo … 6 = sábado (como Date.getDay()).
//    */
//   static generarFechasRecurrentes(desde: Date, hasta: Date, dias: number[], hora: string): Date[] {
//     const [h, m] = hora.split(':').map(Number);
//     const fechas: Date[] = [];
//     const cursor = new Date(desde);
//     cursor.setHours(0, 0, 0, 0);
//     const limite = new Date(hasta);
//     limite.setHours(23, 59, 59, 999);

//     while (cursor <= limite) {
//       if (dias.includes(cursor.getDay())) {
//         const f = new Date(cursor);
//         f.setHours(h, m, 0, 0);
//         fechas.push(f);
//       }
//       cursor.setDate(cursor.getDate() + 1);
//     }
//     return fechas;
//   }
// }
