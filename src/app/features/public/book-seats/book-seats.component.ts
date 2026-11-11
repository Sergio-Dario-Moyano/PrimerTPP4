import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';

import { ReservaService } from '../../../core/services/reserva.service';
import { PeliculaService } from '../../../core/services/pelicula.service';
import { SupabaseService } from '../../../core/services/supabase';
import { AuthService } from '../../../core/services/auth.service';
import { ModalService } from '../../../core/services/modal.service';
import { ListaEsperaService, EstadoEsperaFuncion, desdeUtc } from '../../../core/services/lista-espera.service';

import { Pelicula } from '../../../core/models/Pelicula.model';
import { ResumenCompraComponent } from '../../../shared/components/resumen-compra/resumen-compra.component';
import { AgeWarningModalComponent } from '../../../shared/components/age-warning-modal/age-warning-modal.component';

import { RawFuncion } from '../../../core/models/RawFunction.model';
import { RawButaca } from '../../../core/models/RawButaca.model';
import { RawEntrada } from '../../../core/models/RawEntrada.model';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { Cell } from '../../../core/models/Cell.model';
import { Seat, SeatType } from '../../../core/models/Seat.model';
import { precioBaseVigente, precioButaca, resumirEntradasPorTipo, enPreventa, RECARGO_VIP } from '../../../core/utils/precios';

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
  private listaEspera = inject(ListaEsperaService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly ROWS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T"];
  readonly TOTAL_COLS = 30;
  // Reglas del cliente (mails 12/02 y 10/03): la fila J es la fila accesible,
  // la fila K queda vacía como separación y R, S y T son VIP.
  readonly FILA_ACCESIBLE = 'J';
  readonly FILA_SEPARADOR = 'K';
  readonly VIP_ROWS = ['R', 'S', 'T'];
  private grillaEnProceso: boolean = false;

  pelicula = signal<Pelicula | null>(null);
  precioBase = signal<number>(0);
  esPreventa = signal<boolean>(false);
  /** Recargo VIP configurable (tabla configuracion, en fracción: 0.5 = 50 %). */
  recargoVip = signal<number>(RECARGO_VIP);

  horarioUI = signal<string>('');
  salaUI = signal<string>('');
  peliculaId = signal<string>('');

  funcionIdReal = signal<string | null>(null);

  seats = signal<Seat[]>([]);

  // ----- Lista de espera (mail "RPP final") -----
  funcionCancelada = signal<string | null>(null);
  espera = signal<EstadoEsperaFuncion | null>(null);
  procesandoEspera = signal<boolean>(false);
  private ahora = signal<number>(Date.now());
  private reloj: ReturnType<typeof setInterval> | null = null;
  private refrescoPendiente: ReturnType<typeof setTimeout> | null = null;

  /** Butacas que no están vendidas (libres o elegidas por mí). */
  libres = computed(() => this.seats().filter(s => s.status !== 'occupied').length);
  /** Libres menos las reservadas a otras personas avisadas de la lista. */
  disponibles = computed(() => Math.max(0, this.libres() - (this.espera()?.reservadas ?? 0)));
  miLugar = computed(() => this.espera()?.miLugar ?? null);
  esMiTurno = computed(() => this.miLugar()?.estado === 'notificado');
  agotada = computed(() => !this.cargando() && this.seats().length > 0 && this.disponibles() === 0);
  segundosRestantes = computed(() => {
    const vence = this.miLugar()?.vence_en;
    return vence ? Math.max(0, Math.floor((desdeUtc(vence).getTime() - this.ahora()) / 1000)) : 0;
  });
  cuentaRegresiva = computed(() => {
    const s = this.segundosRestantes();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  cargando = signal<boolean>(true);

  modalEdadAbierto = signal<boolean>(false);
  esMenorRegistrado = signal<boolean>(false);
  restriccionActual = signal<number>(0);

  private realtimeChannel!: RealtimeChannel;

  selected = computed(() => this.seats().filter(s => s.status === 'selected'));
  total = computed(() => this.selected().reduce((sum, s) => sum + s.price, 0));
  nombresButacas = computed(() => this.selected().map(s => s.codigo));

  // Agrupado por tipo: el usuario ve claramente si está pagando una butaca VIP
  resumenEntradas = computed(() =>
    resumirEntradasPorTipo(this.selected().map(s => ({ tipo: s.type, precio: s.price })))
  );

  cantidadVipSeleccionadas = computed(() => this.selected().filter(s => s.type === 'vip').length);
  precioVip = computed(() => precioButaca(this.precioBase(), 'vip', this.recargoVip()));


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

        // Fila K: se dibuja vacía para separar la zona accesible del resto
        if (row === this.FILA_SEPARADOR) {
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
    if (this.reloj) clearInterval(this.reloj);
    if (this.refrescoPendiente) clearTimeout(this.refrescoPendiente);
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

      if (funcionDB.estado === 'cancelada') {
        this.funcionCancelada.set(funcionDB.motivo_cancelacion || 'Problemas técnicos');
      }

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
          // Las celdas marcadas como 'vacia' en la BD no son butacas reales
          if (b.tipo === 'vacia') continue;

          // Tipo de butaca: se respeta butacas.tipo si viene cargado en la BD y,
          // si no (todas quedaron 'estandar' por defecto), se aplica la regla por fila.
          const esVip = b.tipo === 'vip' || this.VIP_ROWS.includes(b.fila);
          const esAccesible = b.tipo === 'accesible' || b.fila === this.FILA_ACCESIBLE;
          const type: SeatType = esVip ? 'vip' : esAccesible ? 'accessible' : 'standard';

          allSeats.push({
            id: b.id,
            codigo: `${b.fila}${b.columna}`,
            row: b.fila,
            num: Number(b.columna),
            type,
            status: asientosOcupados.includes(b.id) ? "occupied" : "free",
            price: precioButaca(this.precioBase(), type, this.recargoVip())
          });
        }
      }

      this.seats.set(allSeats);
      this.suscribirAsientosEnTiempoReal();
      await this.refrescarEspera();
      this.reloj = setInterval(() => {
        this.ahora.set(Date.now());
        // Al vencer mi turno (o el de otro) se recalcula la lista
        const vence = this.miLugar()?.vence_en;
        if (vence && desdeUtc(vence).getTime() < Date.now()) this.refrescarEspera();
      }, 1000);

    } catch (error) {
      console.error('Error sincronizando la grilla con BD:', error);
    } finally {
      this.cargando.set(false);
    }
  }

  async cargarPelicula(id: string): Promise<void> {
    try {
      const data = await this.peliculaService.getPeliculaById(id) as RawPelicula;
      this.precioBase.set(precioBaseVigente(data));

      const { data: config } = await this.supabaseService.client
        .from('configuracion').select('valor').eq('clave', 'recargo_vip_porcentaje').maybeSingle();
      if (config) this.recargoVip.set(Number(config.valor) / 100);
      this.esPreventa.set(enPreventa(data));

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
      this.router.navigate(['/home']);
    }
  }

  private suscribirAsientosEnTiempoReal(): void {
    const supabase = this.supabaseService.client;

    this.realtimeChannel = supabase.channel(`sala-asientos-${this.funcionIdReal()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entradas' },
        (payload: unknown) => {
          const evt = payload as any;
          const funcionReal = this.funcionIdReal();
          if (evt.new?.funcion_id === funcionReal || evt.old?.funcion_id === funcionReal) this.programarRefrescoEspera();

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

  /** Procesa la lista (vence turnos, avisa al siguiente) y trae su estado. */
  async refrescarEspera(): Promise<void> {
    const funcionId = this.funcionIdReal();
    if (!funcionId) return;
    await this.listaEspera.procesar(funcionId);
    this.espera.set(await this.listaEspera.estadoFuncion(funcionId, this.authService.usuarioActual()?.id ?? null));
  }

  /** Varios cambios seguidos en tiempo real → un solo refresco. */
  private programarRefrescoEspera(): void {
    if (this.refrescoPendiente) clearTimeout(this.refrescoPendiente);
    this.refrescoPendiente = setTimeout(() => this.refrescarEspera(), 800);
  }

  async anotarmeEnEspera(): Promise<void> {
    const user = this.authService.usuarioActual();
    if (!user) {
      this.modalService.open('Iniciá sesión', 'La lista de espera es para usuarios registrados.', 'info');
      this.router.navigate(['/login']);
      return;
    }
    this.procesandoEspera.set(true);
    try {
      await this.listaEspera.anotarme(this.funcionIdReal()!, user.id);
      await this.refrescarEspera();
      this.modalService.open('¡Te anotaste!',
        'Si alguien cancela, te avisamos con una notificación y vas a tener 15 minutos para comprar. Activá las notificaciones desde la campanita 🔔.',
        'success');
    } catch (err) {
      this.modalService.open('No se pudo', err instanceof Error ? err.message : 'Error al anotarte.', 'error');
    } finally {
      this.procesandoEspera.set(false);
    }
  }

  async salirDeEspera(): Promise<void> {
    const lugar = this.miLugar();
    if (!lugar) return;
    await this.listaEspera.salir(lugar.id);
    await this.refrescarEspera();
  }

  toggleSeat(uuid: string): void {
    if (this.funcionCancelada()) return;
    const seat = this.seats().find(s => s.id === uuid);
    // No se puede elegir más butacas que las disponibles (las reservadas a la lista de espera no cuentan)
    if (seat?.status === 'free' && this.selected().length >= this.disponibles()) {
      this.modalService.open('Sin butacas disponibles',
        this.disponibles() === 0
          ? 'Las butacas libres están reservadas para la lista de espera. Anotate para que te avisemos.'
          : `Solo podés elegir ${this.disponibles()} butaca(s): el resto está reservado para la lista de espera.`,
        'info');
      return;
    }
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
        .neq('estado', 'cancelada')
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
        id: s.id,
        tipo: s.type,
        precio: s.price
      }));

      this.reservaService.establecerButacas(butacasParaServicio);
      this.reservaService.precioBase.set(this.precioBase());
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
