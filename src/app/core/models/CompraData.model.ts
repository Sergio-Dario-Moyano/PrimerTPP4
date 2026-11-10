export interface CompraData {
  id: string;
  codigo_ticket: string;
  total_pagado: number;
  credito_usado: number | null;
  puntos_ganados: number | null;
  email_contacto: string;
  estado: string;
  perfil_id: string | null;
}
