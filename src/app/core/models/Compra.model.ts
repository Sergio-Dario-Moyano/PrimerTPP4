// Interfaces estrictas para las inserciones en la Base de Datos
export interface CompraInsert {
  perfil_id: string | null;
  cupon_id: string | null;
  total_pagado: number;
  credito_usado: number;
  puntos_ganados: number;
  metodo_pago: string;
  fecha_compra: string;
  estado: string;
  email_contacto: string;
}
