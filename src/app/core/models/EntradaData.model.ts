export interface EntradaData {
  id: string;
  cliente_nombre: string;
  codigo_qr: string;
  codigo_manual: string;
  funcion_id: string;
  precio_cobrado: number;
  estado: string;
  butacas?: { fila: string; columna: string | number; tipo?: string };
}
