// Interfaces de tipado estricto para la Base de Datos y Supabase Realtime
export interface RawFuncion {
  id: string;
  pelicula_id: string;
  sala_id: string | number;
  fecha_hora?: string;
  estado?: 'activa' | 'cancelada';
  motivo_cancelacion?: string | null;
}
