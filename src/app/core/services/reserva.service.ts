import { Service, signal, computed } from '@angular/core';
import { ComboReservado } from '../models/ComboReservado.model';
import { ButacaReservada } from '../models/ButacaReservada.model';

@Service()
export class ReservaService {
  butacas = signal<ButacaReservada[]>([]);
  combos = signal<ComboReservado[]>([]);
  funcionId = signal<string | null>(null);

  totalCombos = computed(() => {
    return this.combos().reduce((acc, combo) => acc + (combo.precioUnitario * combo.cantidad), 0);
  });

  establecerButacas(seleccion: ButacaReservada[]) {
    this.butacas.set(seleccion);
  }

  agregarCombo(combo: ComboReservado) {
    this.combos.update(actuales => {
      const existe = actuales.find(c => c.id === combo.id);
      if (existe) {
        return actuales.map(c => c.id === combo.id ? { ...c, cantidad: c.cantidad + 1 } : c);
      }
      return [...actuales, { ...combo, cantidad: 1 }];
    });
  }

  limpiarReserva() {
    this.butacas.set([]);
    this.combos.set([]);
    this.funcionId.set(null);
  }

  establecerFuncion(id: string) {
    this.funcionId.set(id);
  }
}
