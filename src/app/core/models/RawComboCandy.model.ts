export interface RawComboCandy {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen_url: string | null;
  en_oferta?: boolean;
  activo?: boolean;
  incluye_entrada?: boolean;
}
