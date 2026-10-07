import { Service, signal } from '@angular/core';
import { TipoModal } from '../models/Modal.model';

@Service()
export class ModalService {
  isOpen = signal<boolean>(false);
  titulo = signal<string>('');
  mensaje = signal<string>('');
  tipo = signal<TipoModal>('info');

  /**
   * Abre el modal con los parámetros especificados.
   */
  open(titulo: string, mensaje: string, tipo: TipoModal = 'info') {
    this.titulo.set(titulo);
    this.mensaje.set(mensaje);
    this.tipo.set(tipo);
    this.isOpen.set(true);
  }

  /**
   * Cierra el modal y limpia el estado visual.
   */
  close() {
    this.isOpen.set(false);

    // Opcional: Retrasamos la limpieza de textos para que la animación
    // de cierre no se vea rara al desaparecer el texto de golpe.
    setTimeout(() => {
      this.titulo.set('');
      this.mensaje.set('');
      this.tipo.set('info');
    }, 300);
  }
}
