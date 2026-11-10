import { TipoButacaPrecio } from '../utils/precios';

export interface ButacaReservada {
  id: string;
  fila: string;
  columna: number;
  tipo: TipoButacaPrecio;
  precio: number;
}
