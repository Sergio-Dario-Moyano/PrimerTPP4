import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Html5Qrcode } from 'html5-qrcode';
import { SupabaseService } from '../../../../core/services/supabase';

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

  rol = signal<string>('');
  modo = signal<ModoValidacion>('cine');
  // Solo el admin puede alternar entre sectores; cada empleado queda fijo en el suyo
  puedeCambiarModo = computed(() => this.rol() === 'admin');

  cargando = signal<boolean>(false);
  camaraActiva = signal<boolean>(false);
  resultadoValidacion = signal<ResultadoValidacion | null>(null);
  mensajeError = signal<string>('');

  validarForm = this.fb.nonNullable.group({
    codigoManual: ['', [Validators.required, Validators.minLength(6)]]
  });

  async ngOnInit(): Promise<void> {
    const { data: authData } = await this.supabase.auth.getUser();
    if (!authData?.user) return;

    const { data: perfil } = await this.supabase
      .from('perfiles')
      .select('rol')
      .eq('id', authData.user.id)
      .single();

    const rol = perfil?.rol ?? '';
    this.rol.set(rol);
    if (rol === 'empleado_candy') this.modo.set('candy');
    if (rol === 'empleado_cine') this.modo.set('cine');
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






















// import { Component, inject, signal } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
// import { SupabaseService } from '../../../../core/services/supabase';

// @Component({
//   selector: 'app-validar-qr',
//   standalone: true,
//   imports: [CommonModule, ReactiveFormsModule],
//   templateUrl: './validar-qr.component.html',
//   styleUrls: ['./validar-qr.component.css']
// })
// export class ValidarQrComponent {
//   private fb = inject(FormBuilder);
//   private supabase = inject(SupabaseService).client;

//   cargando = signal<boolean>(false);
//   resultadoValidacion = signal<any | null>(null);
//   mensajeError = signal<string>('');

//   validarForm: FormGroup = this.fb.group({
//     codigoManual: ['', [Validators.required, Validators.minLength(3)]]
//   });

//   async procesarValidacion() {
//     if (this.validarForm.invalid) {
//       this.validarForm.markAllAsTouched();
//       return;
//     }

//     this.cargando.set(true);
//     this.resultadoValidacion.set(null);
//     this.mensajeError.set('');

//     const codigo = this.validarForm.get('codigoManual')?.value.trim().toUpperCase();

//     try {
//       const { data: authData } = await this.supabase.auth.getUser();
//       const usuarioId = authData?.user?.id;

//       // 1. Buscar en la tabla de ENTRADAS (Cine)
//       const { data: entrada, error: errEntrada } = await this.supabase
//         .from('entradas')
//         .select(`
//           id,
//           estado,
//           cliente_nombre,
//           precio_cobrado,
//           funciones ( fecha_hora, salas ( nombre ), peliculas ( titulo ) )
//         `)
//         .eq('codigo_manual', codigo)
//         .maybeSingle();

//       if (entrada) {
//         if (entrada.estado === 'validada') {
//           this.mensajeError.set(`Esta entrada a nombre de ${entrada.cliente_nombre} ya fue validada previamente.`);
//           return;
//         }

//         if (entrada.estado === 'cancelada') {
//           this.mensajeError.set('Esta entrada figura como cancelada y no puede ser utilizada.');
//           return;
//         }

//         const { error: errUpdate } = await this.supabase
//           .from('entradas')
//           .update({ estado: 'validada' })
//           .eq('id', entrada.id);

//         if (errUpdate) throw errUpdate;

//         if (usuarioId) {
//           await this.supabase.from('logs_actividad').insert([{
//             perfil_id: usuarioId,
//             accion: 'VALIDAR_ENTRADA',
//             entidad_afectada: 'entradas',
//             entidad_id: entrada.id,
//             detalle: `Se validó la entrada de cine (PIN: ${codigo}) para ${entrada.cliente_nombre}`
//           }]);
//         }

//         this.resultadoValidacion.set({
//           tipo: 'CINE',
//           titulo: (entrada.funciones as any)?.peliculas?.titulo,
//           sala: (entrada.funciones as any)?.salas?.nombre,
//           cliente: entrada.cliente_nombre,
//           estado: 'VALIDADA CON ÉXITO'
//         });

//         this.validarForm.reset();
//         return;
//       }

//       // 2. Si no es entrada, buscar en DETALLE_CANDY (Candy Bar)
//       const { data: candyList, error: errCandy } = await this.supabase
//         .from('detalle_candy')
//         .select(`
//           id,
//           estado,
//           cantidad,
//           combos_candy ( nombre )
//         `)
//         .eq('estado', 'pendiente');

//       const candyEncontrado = (candyList || []).find(c => c.id.toUpperCase().startsWith(codigo) || c.id.toUpperCase() === codigo);

//       if (candyEncontrado) {
//         const { error: errUpdateCandy } = await this.supabase
//           .from('detalle_candy')
//           .update({ estado: 'entregado' })
//           .eq('id', candyEncontrado.id);

//         if (errUpdateCandy) throw errUpdateCandy;

//         if (usuarioId) {
//           await this.supabase.from('logs_actividad').insert([{
//             perfil_id: usuarioId,
//             accion: 'VALIDAR_CANDY',
//             entidad_afectada: 'detalle_candy',
//             entidad_id: candyEncontrado.id,
//             detalle: `Se entregó el producto de candy bar (ID: ${codigo})`
//           }]);
//         }

//         const comboInfo: any = candyEncontrado.combos_candy;
//         this.resultadoValidacion.set({
//           tipo: 'CANDY BAR',
//           producto: comboInfo?.nombre || 'Combo Confitería',
//           cantidad: candyEncontrado.cantidad,
//           estado: 'ENTREGADO CON ÉXITO'
//         });

//         this.validarForm.reset();
//         return;
//       }

//       this.mensajeError.set('No se encontró ninguna entrada o producto de confitería activo con este código.');

//     } catch (err: any) {
//       console.error(err);
//       this.mensajeError.set(err.message || 'Error al procesar la validación.');
//     } finally {
//       this.cargando.set(false);
//     }
//   }
// }
