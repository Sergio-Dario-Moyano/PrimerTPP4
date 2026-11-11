import { Service, signal } from '@angular/core';
import { TipoModal } from '../models/Modal.model';

@Service()
export class ModalService {
  isOpen = signal<boolean>(false);
  titulo = signal<string>('');
  mensaje = signal<string>('');
  tipo = signal<TipoModal>('info');

  /** Modo confirmación: muestra "Cancelar" y un botón de acción en lugar de "Entendido". */
  esConfirmacion = signal<boolean>(false);
  textoConfirmar = signal<string>('Aceptar');
  textoCancelar = signal<string>('Cancelar');

  private resolverConfirmacion: ((valor: boolean) => void) | null = null;

  /**
   * Abre el modal con los parámetros especificados.
   */
  open(titulo: string, mensaje: string, tipo: TipoModal = 'info') {
    this.finalizarConfirmacion(false);
    this.esConfirmacion.set(false);
    this.titulo.set(titulo);
    this.mensaje.set(mensaje);
    this.tipo.set(tipo);
    this.isOpen.set(true);
  }

  /**
   * Reemplaza al confirm() nativo del navegador.
   * Devuelve una promesa que se resuelve en true si el usuario confirma.
   *
   *   if (!(await this.modalService.confirmar('Eliminar', '¿Seguro?'))) return;
   */
  confirmar(
    titulo: string,
    mensaje: string,
    textoConfirmar = 'Aceptar',
    textoCancelar = 'Cancelar',
    tipo: TipoModal = 'info'
  ): Promise<boolean> {
    this.finalizarConfirmacion(false);
    this.titulo.set(titulo);
    this.mensaje.set(mensaje);
    this.tipo.set(tipo);
    this.textoConfirmar.set(textoConfirmar);
    this.textoCancelar.set(textoCancelar);
    this.esConfirmacion.set(true);
    this.isOpen.set(true);
    return new Promise<boolean>(resolve => (this.resolverConfirmacion = resolve));
  }

  /** Botón de acción del modal de confirmación. */
  aceptar() {
    this.finalizarConfirmacion(true);
    this.cerrarVisual();
  }

  /**
   * Cierra el modal y limpia el estado visual.
   * Si era una confirmación, cuenta como "Cancelar".
   */
  close() {
    this.finalizarConfirmacion(false);
    this.cerrarVisual();
  }

  private finalizarConfirmacion(valor: boolean) {
    const resolver = this.resolverConfirmacion;
    this.resolverConfirmacion = null;
    resolver?.(valor);
  }

  private cerrarVisual() {
    this.isOpen.set(false);

    // Retrasamos la limpieza de textos para que la animación
    // de cierre no se vea rara al desaparecer el texto de golpe.
    setTimeout(() => {
      if (this.isOpen()) return; // se abrió otro modal mientras tanto
      this.titulo.set('');
      this.mensaje.set('');
      this.tipo.set('info');
      this.esConfirmacion.set(false);
    }, 300);
  }
}
