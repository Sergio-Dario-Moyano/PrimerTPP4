
export interface RawPelicula {
  id: string;
  titulo: string;
  sinopsis: string;
  duracion_minutos: number;
  url_imagen: string;
  restriccion_edad: number;
  precio_base: number;
  preventa_inicio: string | null; // Permite null
  preventa_precio: number | null; // Permite null
  estado: string;
  creado_en: string;
  entradas_vendidas: number;
  hero_imagen: string;

  // Este campo no está en la tabla física, pero llega
  // cuando hacemos un JOIN (select) con la tabla de géneros
  pelicula_genero?: { generos: { nombre: string } }[];
}
