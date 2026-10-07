import { Seat } from './Seat.model';

// Extraemos los tipos permitidos para mantener el estándar estricto
export type CellType = 'seat' | 'aisle' | 'empty';

// Aplicamos el tipo a la interfaz principal
export interface Cell {
  type: CellType;
  seat?: Seat;
}
