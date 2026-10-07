import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-age-warning-modal',
  imports: [],
  templateUrl: './age-warning-modal.component.html',
  styleUrls: ['./age-warning-modal.component.css']
})
export class AgeWarningModalComponent {
  isOpen = input<boolean>(false);
  esMenorRegistrado = input<boolean>(false);
  restriccionEdad = input<number>(0);

  confirmar = output<void>();
  cancelar = output<void>();

  onCancelar() {
    this.cancelar.emit();
  }

  onConfirmar() {
    this.confirmar.emit();
  }
}
