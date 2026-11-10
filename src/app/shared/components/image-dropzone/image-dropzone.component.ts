import { Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { StorageService } from '../../../core/services/storage.service';

/**
 * Zona para arrastrar (o elegir) una imagen. La sube a Supabase Storage y
 * guarda la URL pública en el formControl, así el resto del formulario
 * no cambia: sigue guardando un texto con la URL.
 *
 * <app-image-dropzone formControlName="url_imagen" carpeta="posters" etiqueta="Póster" />
 */
@Component({
  selector: 'app-image-dropzone',
  standalone: true,
  templateUrl: './image-dropzone.component.html',
  styleUrl: './image-dropzone.component.css',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => ImageDropzoneComponent),
    multi: true
  }]
})
export class ImageDropzoneComponent implements ControlValueAccessor {
  private storage = inject(StorageService);

  etiqueta = input<string>('Imagen');
  carpeta = input<string>('varios');
  /** 'poster' (vertical) o 'banner' (horizontal): solo cambia la proporción de la vista previa. */
  formato = input<'poster' | 'banner' | 'cuadrado'>('poster');

  url = signal<string>('');
  arrastrando = signal<boolean>(false);
  subiendo = signal<boolean>(false);
  error = signal<string>('');
  deshabilitado = signal<boolean>(false);

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  // ----- ControlValueAccessor -----
  writeValue(valor: string | null): void { this.url.set(valor ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.deshabilitado.set(d); }

  // ----- Drag & drop -----
  onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (!this.deshabilitado()) this.arrastrando.set(true);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    this.arrastrando.set(false);
  }

  async onDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    this.arrastrando.set(false);
    const archivo = e.dataTransfer?.files?.[0];
    if (archivo) await this.subir(archivo);
  }

  async onSeleccion(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (archivo) await this.subir(archivo);
    input.value = '';
  }

  quitar(): void {
    this.url.set('');
    this.onChange('');
    this.onTouched();
  }

  private async subir(archivo: File): Promise<void> {
    if (this.deshabilitado()) return;
    this.error.set('');
    this.subiendo.set(true);
    try {
      const url = await this.storage.subirImagen(archivo, this.carpeta());
      this.url.set(url);
      this.onChange(url);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Error al subir la imagen.');
    } finally {
      this.subiendo.set(false);
      this.onTouched();
    }
  }
}
