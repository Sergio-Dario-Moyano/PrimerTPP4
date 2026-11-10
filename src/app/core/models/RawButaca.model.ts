export type TipoButacaDB = 'estandar' | 'accesible' | 'vip' | 'vacia';

export interface RawButaca {
  id: string;
  fila: string;
  columna: string | number;
  tipo: TipoButacaDB | null;
}
