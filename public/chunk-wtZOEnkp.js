import{B as N,Yn as yo,qn as xy}from"./chunk-w8iuamG4.js";var o=class a{supabase=N(xy).client;async getPeliculaById(i){let{data:e,error:r}=await this.supabase.from(`peliculas`).select(`
        *,
        pelicula_genero (
          generos (nombre)
        )
      `).eq(`id`,i).single();if(r)throw r;return e}async agregarPelicula(i){let{data:e,error:r}=await this.supabase.from(`peliculas`).insert([i]);if(r)throw r;return e}static ɵfac=function(e){return new(e||a)};static ɵprov=yo({token:a,factory:a.ɵfac})};export{o as t};