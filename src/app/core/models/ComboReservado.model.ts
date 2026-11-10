/** Ítem del carrito del candy: un combo o un producto suelto. */
export interface ComboReservado {
  id: string;
  tipo: 'combo' | 'producto';
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  /** Combos "entrada + pochoclos + bebida": cada unidad cubre una entrada. */
  incluyeEntrada?: boolean;
}
