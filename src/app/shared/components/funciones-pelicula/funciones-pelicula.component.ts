import { Component, input, output, signal, computed, effect } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { FuncionPelicula } from '../../../core/models/Funcion.model';

@Component({
  selector: 'app-funciones-pelicula',
  standalone: true,
  imports: [DatePipe, UpperCasePipe],
  templateUrl: './funciones-pelicula.component.html',
  styleUrl: './funciones-pelicula.component.css'
})
export class FuncionesPeliculaComponent {

  // Inputs y Outputs fuertemente tipados
  funciones = input<FuncionPelicula[]>([]);
  onSeleccionar = output<FuncionPelicula & { sala: string }>();

  fechaSeleccionada = signal<string | null>(null);

  constructor() {
    effect(() => {
      const dias = this.diasDisponibles();
      if (dias.length > 0 && (!this.fechaSeleccionada() || !dias.some(d => d.key === this.fechaSeleccionada()))) {
        this.fechaSeleccionada.set(dias[0].key);
      }
    }, { allowSignalWrites: true });
  }

  // Helper privado para limpiar las fechas
  private parseFecha(fechaIso: string): Date {
    const fechaLimpiada = fechaIso.includes('T') ? fechaIso : fechaIso.replace(' ', 'T');
    return new Date(fechaLimpiada);
  }

  // 💡 Filtrar días para mostrar únicamente los que tengan funciones futuras
  diasDisponibles = computed(() => {
    const ahora = new Date();
    const mapDias = new Map<string, string>();

    this.funciones().forEach(f => {
      const fechaObj = this.parseFecha(f.fecha_hora);

      // Solo incluimos la fecha si la función aún no ha pasado
      if (fechaObj >= ahora) {
        const key = fechaObj.toISOString().split('T')[0];

        if (!mapDias.has(key)) {
          const diaSemana = fechaObj.toLocaleDateString('es-AR', { weekday: 'short' }).toUpperCase();
          const diaMes = fechaObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
          mapDias.set(key, `${diaSemana} ${diaMes}`);
        }
      }
    });

    return Array.from(mapDias.entries()).map(([key, label]) => ({ key, label }));
  });

  // 💡 Filtrar funciones por fecha seleccionada y descartar las ya pasadas
  funcionesFiltradas = computed(() => {
    const ahora = new Date();
    const sel = this.fechaSeleccionada();

    // Primero descartamos todas las funciones cuya fecha/hora ya haya transcurrido
    const funcionesFuturas = this.funciones().filter(f => {
      return this.parseFecha(f.fecha_hora) >= ahora;
    });

    const filtradas = !sel
      ? funcionesFuturas
      : funcionesFuturas.filter(f => {
          const key = this.parseFecha(f.fecha_hora).toISOString().split('T')[0];
          return key === sel;
        });

    return filtradas.map(f => ({
      ...f,
      fechaObj: this.parseFecha(f.fecha_hora)
    }));
  });

  seleccionarDia(key: string): void {
    this.fechaSeleccionada.set(key);
  }

  seleccionarFuncion(funcion: FuncionPelicula): void {
    const funcionAdaptada = {
      ...funcion,
      sala: `Sala ${funcion.sala_id}`
    };
    this.onSeleccionar.emit(funcionAdaptada);
  }
}
