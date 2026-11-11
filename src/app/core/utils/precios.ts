/**
 * Reglas de precios centralizadas.
 * Antes los precios estaban "hardcodeados" (5000 / 7000) en varios componentes;
 * ahora todos los cálculos salen de acá para que mapa, candy y checkout coincidan.
 */

/** Recargo por defecto de las butacas VIP (filas R, S y T). Editable en Admin → Puntos y Canjes. */
export const RECARGO_VIP = 0.5; // +50 %

/** La preventa dura 7 días desde preventa_inicio (hasta el estreno). */
export const DIAS_PREVENTA = 7;

export type TipoButacaPrecio = 'standard' | 'accessible' | 'vip';

export interface DatosPrecioPelicula {
  precio_base: number;
  preventa_inicio?: string | null;
  preventa_precio?: number | null;
}

/** Devuelve true si la película está en período de preventa en la fecha indicada. */
export function enPreventa(peli: DatosPrecioPelicula, ahora: Date = new Date()): boolean {
  if (!peli.preventa_inicio || peli.preventa_precio == null) return false;
  const inicio = new Date(peli.preventa_inicio.replace(' ', 'T'));
  const fin = new Date(inicio.getTime() + DIAS_PREVENTA * 24 * 60 * 60 * 1000);
  return ahora >= inicio && ahora < fin;
}

/**
 * ¿Ya se pueden comprar entradas? En cartelera, o en preventa (los 7 días previos
 * al estreno), o si ya pasó la fecha de estreno aunque siga marcada "próximamente".
 */
export function ventaAbierta(
  peli: DatosPrecioPelicula & { estado?: string; fecha_estreno?: string | null },
  ahora: Date = new Date()
): boolean {
  if (peli.estado === 'cartelera') return true;
  if (peli.estado === 'archivada') return false;
  if (peli.fecha_estreno && new Date(`${peli.fecha_estreno}T00:00:00`) <= ahora) return true;
  if (!peli.preventa_inicio) return false;
  return new Date(peli.preventa_inicio.replace(' ', 'T')) <= ahora;
}

/** Precio base vigente: precio de preventa si corresponde, si no el precio normal. */
export function precioBaseVigente(peli: DatosPrecioPelicula, ahora: Date = new Date()): number {
  return enPreventa(peli, ahora) ? Number(peli.preventa_precio) : Number(peli.precio_base);
}

/** Precio final de una butaca según su tipo. */
export function precioButaca(precioBase: number, tipo: TipoButacaPrecio, recargoVip: number = RECARGO_VIP): number {
  return tipo === 'vip' ? Math.round(precioBase * (1 + recargoVip)) : precioBase;
}

/** Agrupa butacas por tipo para mostrar el detalle en los resúmenes de compra. */
export function resumirEntradasPorTipo(
  butacas: { tipo: TipoButacaPrecio; precio: number }[]
): { cantidad: number; tipo: string; precioTotal: number }[] {
  const etiquetas: Record<TipoButacaPrecio, string> = {
    standard: 'Entrada General',
    accessible: 'Entrada Accesible',
    vip: 'Entrada VIP ★'
  };
  const grupos = new Map<TipoButacaPrecio, { cantidad: number; precioTotal: number }>();
  for (const b of butacas) {
    const g = grupos.get(b.tipo) ?? { cantidad: 0, precioTotal: 0 };
    g.cantidad++;
    g.precioTotal += b.precio;
    grupos.set(b.tipo, g);
  }
  return Array.from(grupos.entries()).map(([tipo, g]) => ({ tipo: etiquetas[tipo], ...g }));
}

/**
 * Monto de entradas que queda cubierto por combos con entrada incluida o por
 * entradas gratis canjeadas con puntos. Cubre primero las butacas más baratas y,
 * si es VIP, solo el precio base (el recargo VIP se sigue cobrando).
 */
export function montoEntradasCubiertas(
  butacas: { precio: number }[],
  cantidadCubierta: number,
  precioBase: number
): number {
  return [...butacas]
    .sort((a, b) => a.precio - b.precio)
    .slice(0, Math.max(0, cantidadCubierta))
    .reduce((acc, b) => acc + Math.min(b.precio, precioBase), 0);
}
