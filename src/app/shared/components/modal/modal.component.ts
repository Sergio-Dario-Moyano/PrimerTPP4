import { Component, inject } from '@angular/core';
import { ModalService } from '../../../core/services/modal.service';

@Component({
  selector: 'app-modal-component',
  standalone: true,
  imports: [],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css'
})
export class ModalComponent {
  // Inyectamos el servicio de forma pública para leerlo desde el HTML
  private modalService = inject(ModalService);

  // Exponemos solo las señales que la vista necesita leer
  isOpen = this.modalService.isOpen;
  tipo = this.modalService.tipo;
  titulo = this.modalService.titulo;
  mensaje = this.modalService.mensaje;

  cerrar() {
    this.modalService.close();
  }
}
