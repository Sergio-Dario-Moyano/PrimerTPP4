import { Service, inject } from '@angular/core';
import { SupabaseService } from './supabase';

export const BUCKET_IMAGENES = 'imagenes';

/** Subida de imágenes a Supabase Storage (bucket público "imagenes"). */
@Service()
export class StorageService {
  private supabase = inject(SupabaseService).client;

  /** Sube el archivo a /carpeta/ y devuelve su URL pública. */
  async subirImagen(archivo: File, carpeta: string): Promise<string> {
    if (!archivo.type.startsWith('image/')) {
      throw new Error('El archivo debe ser una imagen.');
    }
    if (archivo.size > 5 * 1024 * 1024) {
      throw new Error('La imagen no puede pesar más de 5 MB.');
    }

    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg';
    const ruta = `${carpeta}/${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.storage
      .from(BUCKET_IMAGENES)
      .upload(ruta, archivo, { cacheControl: '3600', upsert: false, contentType: archivo.type });

    if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);

    return this.supabase.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta).data.publicUrl;
  }
}
