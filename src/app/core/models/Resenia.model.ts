
export interface Resena {
  id?: string;
  perfil_id: string;
  pelicula_id: string;
  calificacion: number;
  comentario: string;
  fecha: string;
  // Relación con la tabla perfiles para mostrar quién comentó
  perfiles?: {
    nombre: string;
    apellido: string;
  };
}
