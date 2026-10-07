// Exportamos los tipos permitidos
export type SeatType = "standard" | "accessible" | "vip";
export type SeatStatus = "free" | "occupied" | "selected";

// Exportamos la interfaz principal usando los tipos de arriba (sin importar nada de afuera)
export interface Seat {
  id: string;
  codigo: string;
  row: string;
  num: number;
  type: SeatType;
  status: SeatStatus;
  price: number;
}
