import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { ModalComponent } from './shared/components/modal/modal.component';

@Component({
  imports: [RouterOutlet, NavbarComponent, ModalComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('cineutnApp');
}
