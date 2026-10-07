
export interface Pelicula {
  id: string;
  titulo: string;
  sinopsis: string;
  duracion: number;
  poster_url: string;
  clasificacion: string;
  generos: string[];
  formatos: string[];
  idiomas: string[];
  hero_imagen:string;
  entradasVendidas?: number;
}
