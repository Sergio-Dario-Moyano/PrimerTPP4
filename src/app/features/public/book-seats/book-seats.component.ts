import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';

import { ReservaService } from '../../../core/services/reserva.service';
import { PeliculaService } from '../../../core/services/pelicula.service';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';

import { Pelicula } from '../../../core/models/Pelicula.model';
import { ResumenCompraComponent } from '../../../shared/components/resumen-compra/resumen-compra.component';
import { AgeWarningModalComponent } from '../../../shared/components/age-warning-modal/age-warning-modal.component';

import { RawFuncion } from '../../../core/models/RawFunction.model';
import { RawButaca } from '../../../core/models/RawButaca.model';
import { RawEntrada } from '../../../core/models/RawEntrada.model';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { Cell } from '../../../core/models/Cell.model';
import { Seat } from '../../../core/models/Seat.model';

@Component({
  selector: 'app-book-seats',
  standalone: true,
  imports: [NgClass, DatePipe, ResumenCompraComponent, AgeWarningModalComponent],
  templateUrl: './book-seats.component.html',
  styleUrls: ['./book-seats.component.css']
})
export class BookSeatsComponent implements OnInit, OnDestroy {
  private reservaService = inject(ReservaService);
  private peliculaService = inject(PeliculaService);
  private supabaseService = inject(SupabaseService);
  private authService = inject(AuthService);
  private modalService = inject(ModalService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly ROWS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"];
  readonly VIP_ROWS = ["R","S","T"];
  readonly TOTAL_COLS = 30;
  private grillaEnProceso: boolean = false;

  pelicula = signal<Pelicula | null>(null);

  horarioUI = signal<string>('');
  salaUI = signal<string>('');
  peliculaId = signal<string>('');

  funcionIdReal = signal<string | null>(null);

  seats = signal<Seat[]>([]);
  cargando = signal<boolean>(true);

  modalEdadAbierto = signal<boolean>(false);
  esMenorRegistrado = signal<boolean>(false);
  restriccionActual = signal<number>(0);

  private realtimeChannel!: RealtimeChannel;

  selected = computed(() => this.seats().filter(s => s.status === 'selected'));
  total = computed(() => this.selected().reduce((sum, s) => sum + s.price, 0));
  nombresButacas = computed(() => this.selected().map(s => s.codigo));

  resumenEntradas = computed(() => {
    const seleccionadas = this.selected();
    if (seleccionadas.length === 0) return [];
    return [{
      cantidad: seleccionadas.length,
      tipo: 'Entrada General',
      precioTotal: this.total()
    }];
  });

  cargoServicio = computed(() => this.selected().length > 0 ? 1.99 : 0);

  rowGroups = computed(() => {
    const currentSeats = this.seats();
    return this.ROWS.map(row => {
      const cells: Cell[] = [];
      for (let c = 1; c <= this.TOTAL_COLS; c++) {
        // Pasillos
        if (c === 5 || c === 26) {
          cells.push({ type: 'aisle' });
          continue;
        }

        // Fila I queda completamente vacía para separar la zona accesible (Fila J) - REGLA APLICADA
        if (row === 'I') {
          cells.push({ type: 'empty' });
          continue;
        }

        const codigo = `${row}${c}`;
        const seatData = currentSeats.find(s => s.codigo === codigo);
        cells.push(seatData ? { type: 'seat', seat: seatData } : { type: 'empty' });
      }
      return { row, cells };
    });
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.peliculaId.set(id);
        this.verificarYConstruir();
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const horario = params.get('horario');
      const sala = params.get('sala');
      if (horario) this.horarioUI.set(horario);
      if (sala) this.salaUI.set(sala);
      this.verificarYConstruir();
    });
  }

  verificarYConstruir(): void {
    if (this.peliculaId() && this.horarioUI() && this.salaUI() && !this.grillaEnProceso) {
      this.grillaEnProceso = true;
      this.construirGrillaDesdeBD();
    }
  }

  ngOnDestroy(): void {
    if (this.realtimeChannel) {
      this.supabaseService.client.removeChannel(this.realtimeChannel);
    }
  }

  async construirGrillaDesdeBD(): Promise<void> {
    this.cargando.set(true);
    const supabase = this.supabaseService.client;

    try {
      const funcionIdRuta = this.peliculaId();

      const { data: funcionDB, error: errFuncion } = await supabase
        .from('funciones')
        .select('*')
        .eq('id', funcionIdRuta)
        .single();

      if (errFuncion || !funcionDB) throw new Error('Función no encontrada');
      const funcion = funcionDB as RawFuncion;

      this.funcionIdReal.set(funcion.id);
      this.peliculaId.set(funcion.pelicula_id);

      await this.cargarPelicula(funcion.pelicula_id);

      const { data: butacasDB } = await supabase
        .from('butacas')
        .select('*')
        .eq('sala_id', funcion.sala_id);

      const { data: entradasVendidas } = await supabase
        .from('entradas')
        .select('butaca_id')
        .eq('funcion_id', funcion.id)
        .neq('estado', 'cancelada');

      const asientosOcupados = (entradasVendidas as RawEntrada[])?.map(e => e.butaca_id) || [];
      const allSeats: Seat[] = [];

      if (butacasDB) {
        for (const b of butacasDB as RawButaca[]) {
          const codigo = `${b.fila}${b.columna}`;
          const isVip = this.VIP_ROWS.includes(b.fila);
          const isAccessible = b.fila === 'J';

          allSeats.push({
            id: b.id,
            codigo: codigo,
            row: b.fila,
            num: Number(b.columna),
            type: isAccessible ? "accessible" : isVip ? "vip" : "standard",
            status: asientosOcupados.includes(b.id) ? "occupied" : "free",
            price: isVip ? 7000 : 5000
          });
        }
      }

      this.seats.set(allSeats);
      this.suscribirAsientosEnTiempoReal();

    } catch (error) {
      console.error('Error sincronizando la grilla con BD:', error);
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarPelicula(id: string): Promise<void> {
    try {
      const data = await this.peliculaService.getPeliculaById(id) as RawPelicula;

      this.pelicula.set({
        id: String(data.id),
        titulo: data.titulo,
        sinopsis: data.sinopsis,
        duracion: Number(data.duracion_minutos),
        poster_url: data.url_imagen,
        clasificacion: data.restriccion_edad === 0 ? 'ATP' : `+${data.restriccion_edad}`,
        generos: data.pelicula_genero?.map((r: any) => r.generos.nombre) || [],
        formatos: ['2D', '3D'],
        idiomas: ['Castellano'],
        hero_imagen: data.hero_imagen
      });

      if (data.restriccion_edad && data.restriccion_edad > 0) {
        await this.validarRestriccionEdad(data.restriccion_edad);
      }
    } catch (error) {
      console.error('Error cargando película:', error);
    }
  }

  async validarRestriccionEdad(restriccion: number): Promise<void> {
    this.restriccionActual.set(restriccion);
    const usuarioActivo = this.authService.usuarioActual();

    if (!usuarioActivo) {
      this.esMenorRegistrado.set(false);
      this.modalEdadAbierto.set(true);
    } else {
      const supabase = this.supabaseService.client;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('fecha_nacimiento')
        .eq('id', usuarioActivo.id)
        .single();

      if (perfil?.fecha_nacimiento) {
        const edad = this.calcularEdad(perfil.fecha_nacimiento);
        if (edad < restriccion) {
          this.esMenorRegistrado.set(true);
          this.modalEdadAbierto.set(true);
        }
      }
    }
  }

  calcularEdad(fechaNacimiento: string): number {
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    return edad;
  }

  cerrarModalEdad(redireccionar: boolean = false): void {
    this.modalEdadAbierto.set(false);
    if (redireccionar) {
      this.router.navigate(['/cartelera']);
    }
  }

  private suscribirAsientosEnTiempoReal(): void {
    const supabase = this.supabaseService.client;

    this.realtimeChannel = supabase.channel('sala-asientos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entradas' },
        (payload: unknown) => {
          const evt = payload as any;
          const funcionReal = this.funcionIdReal();

          if (evt.eventType === 'INSERT' && evt.new?.funcion_id === funcionReal) {
            if (evt.new.estado !== 'cancelada') {
              this.bloquearButacaPorUUID(evt.new.butaca_id);
            }
          }

          if (evt.eventType === 'UPDATE' && evt.new?.funcion_id === funcionReal) {
            if (evt.new.estado === 'cancelada') {
              this.liberarButacaPorUUID(evt.new.butaca_id);
            } else {
              this.bloquearButacaPorUUID(evt.new.butaca_id);
            }
          }

          if (evt.eventType === 'DELETE' && evt.old) {
            this.liberarButacaPorUUID(evt.old.butaca_id);
          }
        }
      )
      .subscribe();
  }

  private liberarButacaPorUUID(butacaUuid: string): void {
    this.seats.update(prev => prev.map(s =>
      s.id === butacaUuid ? { ...s, status: 'free' } : s
    ));
  }

  private bloquearButacaPorUUID(butacaUuid: string): void {
    this.seats.update(prev => prev.map(s =>
      s.id === butacaUuid ? { ...s, status: 'occupied' } : s
    ));
  }

  toggleSeat(uuid: string): void {
    this.seats.update(prev => prev.map(s => {
      if (s.id !== uuid || s.status === "occupied") return s;
      return { ...s, status: s.status === "selected" ? "free" : "selected" };
    }));
  }

  async confirmarSeleccion(): Promise<void> {
    const seleccionadas = this.selected();
    if (seleccionadas.length === 0) return;

    const butacasDeseadasIds = seleccionadas.map(s => s.id);
    const supabase = this.supabaseService.client;

    try {
      const { data: butacasRobadas } = await supabase
        .from('entradas')
        .select('butaca_id')
        .eq('funcion_id', this.funcionIdReal())
        .in('estado', ['validada', 'pendiente'])
        .in('butaca_id', butacasDeseadasIds);

      // REEMPLAZO DE ALERT POR MODAL GLOBAL
      if (butacasRobadas && butacasRobadas.length > 0) {
        this.modalService.open(
          'Butacas no disponibles',
          'Lo sentimos, una o más de tus butacas acaban de ser reservadas por otra persona. Por favor, elige otras.',
          'error'
        );
        butacasRobadas.forEach(b => this.bloquearButacaPorUUID(b.butaca_id));
        return;
      }

      const butacasParaServicio = seleccionadas.map(s => ({
        fila: s.row,
        columna: s.num,
        id: s.id
      }));

      this.reservaService.establecerButacas(butacasParaServicio);
      this.reservaService.establecerFuncion(this.funcionIdReal()!);

      this.router.navigate(['/confiteria', this.peliculaId()], {
        queryParams: { horario: this.horarioUI(), sala: this.salaUI() }
      });

    } catch (error) {
      console.error('Error al validar butacas:', error);
      //REEMPLAZO DE ALERT POR MODAL GLOBAL
      this.modalService.open('Error', 'Hubo un error al verificar los asientos. Intenta de nuevo.', 'error');
    }
  }
}
