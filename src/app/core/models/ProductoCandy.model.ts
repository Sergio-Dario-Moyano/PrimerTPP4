/** Producto mostrado en el candy (combo o producto suelto). */
export interface ProductoCandy {
  id: string;
  tipo: 'combo' | 'producto';
  nombre: string;
  descripcion: string;
  precio: number;
  imagenUrl: string;
  enOferta: boolean;
  incluyeEntrada: boolean;
  categoriaId: number | null;
}
