import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CarteleraService } from '../../../core/services/cartelera.service';
import { Pelicula } from '../../../core/models/Pelicula.model';
import { RawPelicula } from '../../../core/models/RawPelicula.model';
import { Combo } from '../../../core/models/Combo.model';
import { RawCombo } from '../../../core/models/RawCombo.model';

@Component({
  selector: 'app-cartelera',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cartelera.component.html',
  styleUrl: './cartelera.component.css'
})
export class CarteleraComponent implements OnInit {

  private carteleraService = inject(CarteleraService);

  peliculas = signal<Pelicula[]>([]);
  combos = signal<Combo[]>([]);
  generos = signal<string[]>(['Todos']);
  generoSeleccionado = signal<string>("Todos");
  terminoBusqueda = signal<string>("");
  indiceDestacado = signal<number>(0);
  cargando = signal<boolean>(true);

  ngOnInit(): void {
    this.cargarDatosCartelera();
  }

  async cargarDatosCartelera(): Promise<void> {
    try {
      this.cargando.set(true);

      const respuestaPeliculas = await this.carteleraService.getPeliculas();
      const respuestaCombos = await this.carteleraService.getCombos();

      if (respuestaPeliculas.data) {
        const dataPeliculas: Pelicula[] = respuestaPeliculas.data.map((p: RawPelicula) => {
          const generosMapeados = p.pelicula_genero && p.pelicula_genero.length > 0
            ? p.pelicula_genero.map((relacion: any) => relacion.generos?.nombre || 'Sin género')
            : ['Sin género'];

          const clasificacion = p.restriccion_edad === 0 ? 'ATP' : `+${p.restriccion_edad}`;

          return {
            id: String(p.id),
            titulo: p.titulo,
            sinopsis: p.sinopsis,
            duracion: Number(p.duracion_minutos),
            poster_url: p.url_imagen,
            clasificacion: clasificacion,
            generos: generosMapeados,
            formatos: ['2D', '3D'],
            idiomas: ['Castellano'],
            hero_imagen: p.hero_imagen,
            entradasVendidas: Number(p.entradas_vendidas || 0)
          };
        });

        this.peliculas.set(dataPeliculas);

        const todosLosGeneros = dataPeliculas.flatMap(p => p.generos);
        const generosUnicos = Array.from(new Set(todosLosGeneros));
        this.generos.set(['Todos', ...generosUnicos]);
      }

      if (respuestaCombos.data) {
        const dataCombos: Combo[] = respuestaCombos.data.map((c: RawCombo) => ({
          id: String(c.id),
          nombre: c.nombre,
          descripcion: c.descripcion,
          precio: `$${Number(c.precio).toLocaleString('es-AR')}`,
          emoji: c.nombre.includes('Mega') ? '🍿🥤🥤' : '🍿',
          esPopular: c.nombre.includes('Mega')
        }));

        this.combos.set(dataCombos);
      }

    } catch (error) {
      console.error('Error al cargar la cartelera:', error);
    } finally {
      this.cargando.set(false);
    }
  }

  top3Peliculas = computed(() => {
    const pelis = this.peliculas();
    return [...pelis]
      .sort((a, b) => (b.entradasVendidas || 0) - (a.entradasVendidas || 0))
      .slice(0, 3);
  });

  peliculaDestacada = computed(() => {
    const pelis = this.peliculas();
    if (pelis.length === 0) return null;
    return pelis[this.indiceDestacado()];
  });

  peliculasFiltradas = computed(() => {
    const genero = this.generoSeleccionado();
    const busqueda = this.terminoBusqueda().toLowerCase();

    return this.peliculas().filter(peli =>
      (genero === "Todos" || peli.generos.includes(genero)) &&
      peli.titulo.toLowerCase().includes(busqueda)
    );
  });

  establecerGenero(genero: string): void {
    this.generoSeleccionado.set(genero);
    this.indiceDestacado.set(0);
  }

  buscarPelicula(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.terminoBusqueda.set(input.value);
    this.indiceDestacado.set(0);
  }

  establecerPeliculaDestacada(indice: number): void {
    this.indiceDestacado.set(indice);
  }
}
