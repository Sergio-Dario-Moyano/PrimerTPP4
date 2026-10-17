import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';
import { RawPelicula } from '../models/RawPelicula.model';

@Service()
export class PeliculaService {
  private supabase = inject(SupabaseService).client;

  async getPeliculaById(id: string): Promise<RawPelicula> {
    const { data, error } = await this.supabase
      .from('peliculas')
      .select(`
        *,
        pelicula_genero (
          generos (nombre)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    return data as RawPelicula;
  }

  async agregarPelicula(peliculaData: {
    titulo: string;
    sinopsis: string;
    duracion_minutos: number;
    url_imagen: string;
    hero_imagen: string;
    restriccion_edad: number;
    precio_base: number;
    estado: string;
  }) {
    const { data, error } = await this.supabase
      .from('peliculas')
      .insert([peliculaData])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 💡 NUEVO: Lógica de negocio para programar funciones con asignación automática de salas,
   * respetando los cruces de horario y el margen obligatorio de 30 minutos entre funciones.
   */
  async programarFuncionConSalaAutomatica(
    peliculaId: string,
    fechaHoraInicioStr: string,
    formato: string,
    idioma: string,
    usuarioId: string
  ) {
    // 1. Obtener la duración de la película seleccionada
    const { data: peli, error: errPeli } = await this.supabase
      .from('peliculas')
      .select('titulo, duracion_minutos')
      .eq('id', peliculaId)
      .single();

    if (errPeli || !peli) throw new Error('No se encontró la película seleccionada.');

    const duracionMinutos = peli.duracion_minutos;

    // Calcular hora de inicio y fin de la nueva función (añadiendo 30 min de margen obligatorio)
    const inicioNueva = new Date(fechaHoraInicioStr.replace(' ', 'T'));
    const finNueva = new Date(inicioNueva.getTime() + (duracionMinutos + 30) * 60000);

    // 2. Obtener todas las salas disponibles (Salas 1 a 5)
    const { data: salas, error: errSalas } = await this.supabase
      .from('salas')
      .select('id, nombre');

    if (errSalas || !salas) throw new Error('Error al cargar las salas del cine.');

    // 3. Obtener las funciones ya programadas y la duración de sus películas
    const { data: funcionesExistentes, error: errFunciones } = await this.supabase
      .from('funciones')
      .select(`
        id,
        sala_id,
        fecha_hora,
        peliculas ( duracion_minutos )
      `);

    if (errFunciones) throw new Error('Error al verificar la disponibilidad de las salas.');

    // 4. Buscar una sala que NO tenga cruce de horarios
    let salaAsignadaId: number | null = null;

    for (const sala of salas) {
      let salaOcupada = false;

      for (const f of (funcionesExistentes || [])) {
        if (f.sala_id === sala.id) {
          const fInicio = new Date(f.fecha_hora.replace(' ', 'T'));
          const peliDuracion = (f.peliculas as any)?.duracion_minutos || 120;
          // Fin de la función existente + 30 min de margen
          const fFin = new Date(fInicio.getTime() + (peliDuracion + 30) * 60000);

          // Validación de intervalo cruzado: (InicioA < FinB) y (FinA > InicioB)
          if (inicioNueva < fFin && finNueva > fInicio) {
            salaOcupada = true;
            break;
          }
        }
      }

      if (!salaOcupada) {
        salaAsignadaId = sala.id;
        break; // Encontramos una sala libre, salimos del bucle
      }
    }

    if (!salaAsignadaId) {
      throw new Error('No hay salas disponibles en este horario debido al solapamiento o al margen de 30 minutos requerido.');
    }

    // 5. Insertar la nueva función con la sala automática
    const { data: nuevaFuncion, error: errInsert } = await this.supabase
      .from('funciones')
      .insert([{
        pelicula_id: peliculaId,
        sala_id: salaAsignadaId,
        fecha_hora: fechaHoraInicioStr,
        formato: formato,
        idioma: idioma
      }])
      .select()
      .single();

    if (errInsert) throw errInsert;

    // 6. Registrar en el Log de Actividad (Auditoría)
    await this.supabase.from('logs_actividad').insert([{
      perfil_id: usuarioId,
      accion: 'CREAR_FUNCION',
      entidad_afectada: 'funciones',
      entidad_id: nuevaFuncion.id,
      detalle: `Se programó la película "${peli.titulo}" en la Sala ${salaAsignadaId} para el ${fechaHoraInicioStr}`
    }]);

    return nuevaFuncion;
  }
}
