export interface FuncionTicketData {
  fecha: Date;
  hora: Date;
  pelicula: { titulo: string; restriccion_edad: number };
  sala: { nombre: string };
}
