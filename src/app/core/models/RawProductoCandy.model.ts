export interface RawProductoCandy {
  id: string;
  categoria_id: number | null;
  nombre: string;
  precio: number;
  url_imagen: string;
  costo_puntos: number;
  activo: boolean;
}
