import { Component, input, output, signal, computed, effect } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common'; // 💡 Importamos solo los pipes necesarios
import { FuncionPelicula } from '../../../core/models/Funcion.model'; // 💡 Importamos la interfaz desde el modelo


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
    // Autorizamos la escritura del Signal dentro del efecto
    effect(() => {
      const dias = this.diasDisponibles();
      if (dias.length > 0 && !this.fechaSeleccionada()) {
        this.fechaSeleccionada.set(dias[0].key);
      }
    }, { allowSignalWrites: true });
  }

  // Helper privado para limpiar las fechas
  private parseFecha(fechaIso: string): Date {
    const fechaLimpiada = fechaIso.includes('T') ? fechaIso : fechaIso.replace(' ', 'T');
    return new Date(fechaLimpiada);
  }

  diasDisponibles = computed(() => {
    const mapDias = new Map<string, string>();

    this.funciones().forEach(f => {
      const fechaObj = this.parseFecha(f.fecha_hora);
      const key = fechaObj.toISOString().split('T')[0];

      if (!mapDias.has(key)) {
        const diaSemana = fechaObj.toLocaleDateString('es-AR', { weekday: 'short' }).toUpperCase();
        const diaMes = fechaObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        mapDias.set(key, `${diaSemana} ${diaMes}`);
      }
    });

    return Array.from(mapDias.entries()).map(([key, label]) => ({ key, label }));
  });

  funcionesFiltradas = computed(() => {
    const sel = this.fechaSeleccionada();

    const filtradas = !sel
      ? this.funciones()
      : this.funciones().filter(f => {
          const key = this.parseFecha(f.fecha_hora).toISOString().split('T')[0];
          return key === sel;
        });

    //  Devolvemos un objeto enriquecido con 'fechaObj'
    // para que el HTML no tenga que procesar strings en cada renderizado.
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
