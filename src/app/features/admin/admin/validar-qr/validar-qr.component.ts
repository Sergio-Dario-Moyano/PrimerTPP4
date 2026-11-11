import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Html5Qrcode } from 'html5-qrcode';
import { SupabaseService } from '../../../../core/services/supabase';
import { PermisosService } from '../../../../core/services/permisos.service';

export type ModoValidacion = 'cine' | 'candy';

export interface ResultadoValidacion {
  tipo: 'CINE' | 'CANDY BAR';
  codigo: string;
  cliente: string;
  pelicula?: string;
  sala?: string;
  fechaHora?: Date;
  restriccionEdad?: number;
  items: string[];
}

interface EntradaValidacion {
  id: string;
  estado: string;
  cliente_nombre: string;
  butacas: { fila: string; columna: number } | null;
  funciones: {
    fecha_hora: string;
    salas: { nombre: string } | null;
    peliculas: { titulo: string; restriccion_edad: number } | null;
  } | null;
}

interface CandyValidacion {
  id: string;
  estado: string;
  cantidad: number;
  combos_candy: { nombre: string } | null;
  productos_candy: { nombre: string } | null;
}

/**
 * Validación de QR / PIN.
 * Una compra tiene UN solo código (compras.codigo_ticket) que sirve para:
 *  - el empleado de cine: valida todas las entradas pendientes de la compra
 *  - el empleado de candy: entrega todos los productos pendientes de la compra
 * Una vez usado, el código deja de funcionar para ese sector.
 */
@Component({
  selector: 'app-validar-qr',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './validar-qr.component.html',
  styleUrls: ['./validar-qr.component.css']
})
export class ValidarQrComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private supabase = inject(SupabaseService).client;

  private escaner: Html5Qrcode | null = null;

  private permisos = inject(PermisosService);
  puedeSala = computed(() => this.permisos.puede('validar_sala'));
  puedeCandy = computed(() => this.permisos.puede('validar_candy'));
  modo = signal<ModoValidacion>('cine');
  // Solo quien tiene permiso para los dos sectores puede alternar
  puedeCambiarModo = computed(() => this.puedeSala() && this.puedeCandy());

  cargando = signal<boolean>(false);
  camaraActiva = signal<boolean>(false);
  resultadoValidacion = signal<ResultadoValidacion | null>(null);
  mensajeError = signal<string>('');

  validarForm = this.fb.nonNullable.group({
    codigoManual: ['', [Validators.required, Validators.minLength(6)]]
  });

  async ngOnInit(): Promise<void> {
    const { data: authData } = await this.supabase.auth.getUser();
    await this.permisos.cargarPara(authData?.user?.id ?? null);
    // Arranca en el sector que puede usar (sala por defecto)
    this.modo.set(this.puedeSala() ? 'cine' : 'candy');
  }

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  cambiarModo(modo: ModoValidacion): void {
    if (!this.puedeCambiarModo()) return;
    this.modo.set(modo);
    this.resultadoValidacion.set(null);
    this.mensajeError.set('');
  }

  // ---------- Cámara ----------

  async iniciarCamara(): Promise<void> {
    this.mensajeError.set('');
    try {
      this.camaraActiva.set(true);
      // Esperamos a que Angular pinte el contenedor #lector-qr
      await new Promise(r => setTimeout(r));
      this.escaner = new Html5Qrcode('lector-qr');
      await this.escaner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (textoLeido) => {
          await this.detenerCamara();
          await this.validarCodigo(textoLeido);
        },
        () => { /* frames sin QR: se ignoran */ }
      );
    } catch (err) {
      console.error(err);
      this.camaraActiva.set(false);
      this.mensajeError.set('No se pudo acceder a la cámara. Podés ingresar el código a mano.');
    }
  }

  async detenerCamara(): Promise<void> {
    if (this.escaner?.isScanning) {
      await this.escaner.stop();
    }
    this.escaner?.clear();
    this.escaner = null;
    this.camaraActiva.set(false);
  }

  // ---------- Validación ----------

  async procesarValidacion(): Promise<void> {
    if (this.validarForm.invalid) {
      this.validarForm.markAllAsTouched();
      return;
    }
    await this.validarCodigo(this.validarForm.controls.codigoManual.value);
  }

  /** Acepta "TK-ABC123" o solo "ABC123". */
  private normalizarCodigo(valor: string): string {
    const limpio = valor.trim().toUpperCase();
    return limpio.startsWith('TK-') ? limpio : `TK-${limpio}`;
  }

  private async validarCodigo(valor: string): Promise<void> {
    this.cargando.set(true);
    this.resultadoValidacion.set(null);
    this.mensajeError.set('');

    const codigo = this.normalizarCodigo(valor);

    try {
      const { data: compra } = await this.supabase
        .from('compras')
        .select('id, estado, email_contacto')
        .eq('codigo_ticket', codigo)
        .maybeSingle();

      if (!compra) {
        this.mensajeError.set(`No existe ninguna compra con el código ${codigo}.`);
        return;
      }
      if (compra.estado === 'cancelada') {
        this.mensajeError.set('Esta compra fue cancelada: el código ya no es válido.');
        return;
      }

      if (this.modo() === 'cine') {
        await this.validarEntradas(compra.id, codigo);
      } else {
        await this.entregarCandy(compra.id, codigo, compra.email_contacto ?? '');
      }

      this.validarForm.reset();
    } catch (err) {
      console.error(err);
      this.mensajeError.set(err instanceof Error ? err.message : 'Error al procesar la validación.');
    } finally {
      this.cargando.set(false);
    }
  }

  private async validarEntradas(compraId: string, codigo: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('entradas')
      .select(`
        id, estado, cliente_nombre,
        butacas ( fila, columna ),
        funciones ( fecha_hora, salas ( nombre ), peliculas ( titulo, restriccion_edad ) )
      `)
      .eq('compra_id', compraId);

    if (error) throw error;
    const entradas = (data ?? []) as unknown as EntradaValidacion[];

    if (entradas.length === 0) {
      this.mensajeError.set('Esta compra no incluye entradas de cine (solo candy).');
      return;
    }

    const pendientes = entradas.filter(e => e.estado === 'pendiente');
    if (pendientes.length === 0) {
      this.mensajeError.set('Estas entradas YA fueron validadas. El QR no puede volver a usarse.');
      return;
    }

    const { error: errUpdate } = await this.supabase
      .from('entradas')
      .update({ estado: 'validada' })
      .in('id', pendientes.map(e => e.id));
    if (errUpdate) throw errUpdate;

    const funcion = pendientes[0].funciones;
    const butacas = pendientes.map(e => `Fila ${e.butacas?.fila} - Butaca ${e.butacas?.columna}`);

    await this.registrarLog('VALIDAR_ENTRADA', 'compras', compraId,
      `Se validaron ${pendientes.length} entrada(s) del ticket ${codigo} (${funcion?.peliculas?.titulo ?? ''})`);

    this.resultadoValidacion.set({
      tipo: 'CINE',
      codigo,
      cliente: pendientes[0].cliente_nombre,
      pelicula: funcion?.peliculas?.titulo,
      sala: funcion?.salas?.nombre,
      fechaHora: funcion ? new Date(funcion.fecha_hora.replace(' ', 'T')) : undefined,
      restriccionEdad: funcion?.peliculas?.restriccion_edad ?? 0,
      items: butacas
    });
  }

  private async entregarCandy(compraId: string, codigo: string, cliente: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('detalle_candy')
      .select('id, estado, cantidad, combos_candy ( nombre ), productos_candy ( nombre )')
      .eq('compra_id', compraId);

    if (error) throw error;
    const items = (data ?? []) as unknown as CandyValidacion[];

    if (items.length === 0) {
      this.mensajeError.set('Esta compra no incluye productos del Candy Bar.');
      return;
    }

    const pendientes = items.filter(i => i.estado === 'pendiente');
    if (pendientes.length === 0) {
      this.mensajeError.set('Los productos de esta compra YA fueron entregados.');
      return;
    }

    const { error: errUpdate } = await this.supabase
      .from('detalle_candy')
      .update({ estado: 'entregado' })
      .in('id', pendientes.map(i => i.id));
    if (errUpdate) throw errUpdate;

    await this.registrarLog('VALIDAR_CANDY', 'compras', compraId,
      `Se entregaron ${pendientes.length} producto(s) del candy del ticket ${codigo}`);

    this.resultadoValidacion.set({
      tipo: 'CANDY BAR',
      codigo,
      cliente,
      items: pendientes.map(i =>
        `${i.cantidad}x ${i.combos_candy?.nombre ?? i.productos_candy?.nombre ?? 'Producto'}`)
    });
  }

  private async registrarLog(accion: string, entidad: string, entidadId: string, detalle: string): Promise<void> {
    const { data: authData } = await this.supabase.auth.getUser();
    await this.supabase.from('logs_actividad').insert([{
      perfil_id: authData?.user?.id ?? null,
      accion,
      entidad_afectada: entidad,
      entidad_id: entidadId,
      detalle
    }]);
  }
}
