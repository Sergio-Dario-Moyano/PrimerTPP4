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
  private modalService = inject(ModalService);

  // Exponemos solo las señales que la vista necesita leer
  isOpen = this.modalService.isOpen;
  tipo = this.modalService.tipo;
  titulo = this.modalService.titulo;
  mensaje = this.modalService.mensaje;
  esConfirmacion = this.modalService.esConfirmacion;
  textoConfirmar = this.modalService.textoConfirmar;
  textoCancelar = this.modalService.textoCancelar;

  cerrar() {
    this.modalService.close();
  }

  aceptar() {
    this.modalService.aceptar();
  }
}
