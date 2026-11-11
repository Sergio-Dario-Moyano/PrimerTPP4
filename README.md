# 🎬 CineLanús

Sistema web de venta de entradas y candy bar para un cine de varias salas.
Trabajo Práctico N.º 1 — Programación IV.

| | |
|---|---|
| 🌐 **App desplegada** | https://cineutnprogramacion4.web.app |
| 📋 **Requerimientos** | [`docs/REQUERIMIENTOS.md`](docs/REQUERIMIENTOS.md) |
| 🗄️ **Cambios de base de datos** | [`supabase/migraciones/`](supabase/migraciones/) |

---

## Índice

1. [Funcionalidades](#funcionalidades)
2. [Tecnologías](#tecnologías)
3. [Arquitectura](#arquitectura)
4. [Modelo de datos](#modelo-de-datos)
5. [Decisiones técnicas](#decisiones-técnicas)
6. [Instalación y uso local](#instalación-y-uso-local)
7. [Usuarios y roles](#usuarios-y-roles)
8. [PWA](#pwa)
9. [Deploy](#deploy)

---

## Funcionalidades

### Cliente
- **Cartelera** con las 3 películas más vendidas primero, buscador por título y filtro por género (una película puede tener varios).
- **Próximamente**: estrenos de las próximas semanas, con alerta para recibir un aviso cuando salen las entradas.
- **Preventa**: venta 7 días antes del estreno con precio especial, configurable por película.
- **Detalle de película** con reseñas, calificación con estrellas y promedio, visibles antes de comprar.
- **Mapa de butacas en tiempo real**: estándar, accesibles (fila J ♿) y VIP (filas R, S y T ★) con recargo.
- **Candy Bar**, de dos maneras:
  - dentro de la compra de entradas, con combos que incluyen la entrada;
  - como pestaña propia (`/candy`), para comprar productos sin entrada.
- **Checkout** con cupones, crédito a favor, entradas gratis por canje de puntos y pago con tarjeta.
- **Ticket** con un único QR para la sala y el candy, y descarga en PDF.
- **Compra anónima**: no hace falta registrarse para comprar.
- **Perfil**: mis entradas, puntos y beneficios, historial de canjes, cupón de bienvenida y "Mis películas" (póster, fecha y calificación propia).
- **Cancelación** hasta 2 horas antes de la función, con reintegro como crédito en la cuenta.
- **Restricción de edad** (+13 / +18): los menores no pueden comprar y el ticket avisa que debe ir un adulto.
- **Lista de espera** en funciones agotadas: si alguien cancela, el primero de la lista recibe una notificación push y tiene 15 minutos para comprar. En el perfil se ve la posición en cada lista.
- **Propuestas de películas**: el cliente sugiere una película que no está en cartelera (una propuesta a la vez).
- **Notificaciones** en la campanita y como push del sistema: lista de espera, función cancelada, propuestas, créditos y estrenos.
- **Reubicación**: si el cine cancela una función, el total vuelve como crédito y la app ofrece elegir otra función de la misma película.

### Empleados
- **Validador de QR** con la cámara o con el código escrito a mano (`TK-XXXXXX` o solo los 6 caracteres).
- Sector **Sala** (`empleado_cine`) o **Candy** (`empleado_candy`). Cada código se usa una sola vez por sector.

### Administrador
| Sección | Qué permite |
|---|---|
| 🎬 Películas | Alta y edición, póster y banner arrastrando la imagen, estado (cartelera / próximamente / archivada), estreno y preventa |
| 🗓️ Funciones | Una fecha o repetidas por días de la semana. La sala se asigna sola, respetando 30 minutos entre funciones |
| 🍿 Candy Bar y Combos | Categorías, productos y combos (con o sin entrada incluida, destacados) |
| 🏷️ Cupones | Alta y edición, incluido el % del cupón de bienvenida y los cupones exclusivos para mayores de 50 |
| ⭐ Puntos y Canjes | Costo en puntos de cada recompensa y recargo de las butacas VIP |
| 📊 Reportes | Facturación y entradas por día, películas más vistas por semana y por mes, candy más vendido, exportación a PDF y Excel |
| 📝 Log de Actividad | Quién creó funciones, cambió precios o validó QRs, con fecha y hora |
| 💡 Propuestas | Ver las propuestas de los clientes; aceptar (abre el alta de película precargada) o rechazar |
| 🔐 Roles y Permisos | Crear roles con acceso solo a ciertas secciones (ej. "solo Reportes") y asignarlos a usuarios |
| 🗓️ Funciones (cancelar) | Cancelar una función completa de forma atómica: crédito a cada comprador, butacas liberadas, notificación y reubicación. También muestra cuánta gente hay en lista de espera |
| 📷 Validar QRs | Validación en los dos sectores |

---

## Tecnologías

| Área | Herramienta |
|---|---|
| Frontend | **Angular 22**: standalone components, signals, reactive forms, control flow (`@if` / `@for`), lazy loading |
| Backend | **Supabase**: PostgreSQL, Auth, Realtime, Storage, triggers |
| PWA | `@angular/service-worker` |
| Gráficos | Chart.js |
| Exportación | jsPDF + jspdf-autotable (PDF), ExcelJS (.xlsx) |
| QR | angularx-qrcode (generar), html5-qrcode (escanear con la cámara) |
| Ticket PDF | html2canvas + jsPDF |
| Hosting | Firebase Hosting |

---

## Arquitectura

```
src/app/
├── core/
│   ├── guards/        authGuard y rolGuard(...roles): protección por sesión y por rol
│   ├── models/        interfaces Raw* (filas de la BD), *Insert (inserciones) y modelos de vista
│   ├── services/      acceso a Supabase y lógica de negocio
│   │                  (funciones, reserva, reportes, fidelización, alertas, log, storage, pwa…)
│   └── utils/         reglas puras: precios, preventa, constantes
├── features/
│   ├── public/        cartelera, próximamente, detalle, butacas, candy, checkout, ticket
│   ├── profile/       mis entradas, puntos, canjes, cupón, mis películas
│   ├── auth/          login y registro
│   └── admin/         panel por secciones + validador de QR
├── shared/
│   ├── components/    navbar, modal, resumen de compra, gráfico de barras,
│   │                  dropzone de imágenes, avisos PWA, modal de edad
│   ├── directives/    appMascaraFecha (fechas y horas tipeadas)
│   └── utils/         fechas (parseo, validadores, conversión a timestamp)
└── directives/        appAdminAccion
```

### Flujo de compra

```
/home ──► /pelicula/:id ──► /sala/:id ──► /confiteria/:id ──► /checkout ──► /ticket/:id
         (función)         (butacas)      (candy, opcional)    (pago)       (QR + PDF)

/candy ─────────────────────────────────────────────────────► /checkout ──► /ticket/:id
(solo candy, sin entradas)
```

El estado de la compra en curso (butacas, candy, función, precio base) vive en `ReservaService` con signals y se comparte entre los pasos.

### Rutas principales

| Ruta | Acceso | Pantalla |
|---|---|---|
| `/home`, `/proximamente`, `/candy`, `/pelicula/:id` | Público | Cartelera, estrenos, candy, detalle |
| `/sala/:id` → `/confiteria/:id` → `/checkout` → `/ticket/:id` | Público | Compra de entradas |
| `/perfil/**` | Usuario logueado | Perfil y beneficios |
| `/admin/peliculas`, `/funciones`, `/candy`, `/cupones`, `/fidelizacion`, `/reportes`, `/log` | `admin` | Panel |
| `/admin/validar` | `admin`, `empleado_cine`, `empleado_candy` | Validador |

---

## Modelo de datos

Tablas principales (PostgreSQL en Supabase):

| Tabla | Para qué |
|---|---|
| `peliculas`, `generos`, `pelicula_genero` | Películas con varios géneros, estado, estreno y preventa |
| `salas`, `butacas` | Salas de 20 filas (A–T) en bloques de 4, 20 y 4; `butacas.tipo` = estándar / accesible / vip / vacía |
| `funciones` | Película + sala + fecha y hora + formato (2D/3D/4D/5D) + idioma |
| `compras` | Una por pago. `codigo_ticket` (QR), total, crédito usado, puntos ganados |
| `entradas` | Una por butaca. Estado: pendiente → validada / cancelada |
| `detalle_candy` | Productos o combos de la compra. Estado: pendiente → entregado / cancelado |
| `productos_candy`, `categorias_candy`, `combos_candy` | Candy bar |
| `cupones` | Porcentaje, exclusivo +50, activo |
| `perfiles` | Datos del registro, rol, puntos, crédito a favor, entradas gratis |
| `canjes` | Historial de canjes de puntos |
| `alertas_estrenos` | Alertas de "Próximamente" |
| `resenas` | Una por usuario y película (1 a 5 estrellas + comentario) |
| `configuracion` | Valores editables: puntos por entrada, recargo VIP |
| `logs_actividad` | Log del panel de administración |
| `propuestas` | Propuestas de películas de los clientes (una pendiente por cliente) |
| `roles` | Roles configurables con la lista de secciones permitidas (`permisos text[]`) |
| `lista_espera` | Lista de espera por función: esperando → notificado (15 min) → compro / vencido |
| `notificaciones` | Notificaciones de cada usuario (campanita + push) |
| `push_suscripciones` | Dispositivos suscriptos a Web Push |
| `creditos_pendientes` | Créditos de compras anónimas en funciones canceladas (se acreditan al iniciar sesión con ese email) |

**Lógica que corre en la base de datos:**
- `crear_perfil_usuario`: crea el perfil al registrarse.
- `generar_codigo_ticket`: genera el código `TK-XXXXXX` de cada compra.
- `actualizar_entradas_vendidas`: mantiene el ranking del Top 3.
- Índice único parcial `(funcion_id, butaca_id) where estado <> 'cancelada'`: impide vender dos veces la misma butaca.
- `cancelar_funcion(p_funcion, p_motivo)`: cancelación **atómica** de una función (ver decisión 13).
- `procesar_listas_espera()`: vence los turnos de más de 15 minutos y avisa al siguiente de cada lista.
- `butacas_libres(p_funcion)` y `reclamar_creditos()`.

---

## Decisiones técnicas

1. **Standalone components + signals.** No hay `NgModule`. El estado de cada pantalla son `signal()`, y los valores derivados (totales, filtros, rankings) son `computed()`. Así la UI se actualiza sola, sin suscripciones manuales.

2. **Lazy loading y guards funcionales.** Cada pantalla se carga con `loadComponent`. `rolGuard('admin')` protege cada sección del panel, y si un empleado intenta entrar a una sección de admin, lo redirige al validador.

3. **Un solo código por compra.** El QR y el PIN manual son el mismo `codigo_ticket`, que sirve para la sala y para el candy. Cada sector cambia solo sus propios estados (`entradas` → validada, `detalle_candy` → entregado). Por eso el código funciona una sola vez en cada sector.

4. **Sala automática.** `FuncionesService.buscarSalaLibre` es una función pura: elige la primera sala sin superposición en el intervalo `[inicio, inicio + duración + 30 min)`. En una programación repetida por días, cada función que se crea se suma a las ocupaciones del lote, así que tampoco chocan entre sí.

5. **Precios en un solo lugar.** `core/utils/precios.ts` centraliza el precio vigente (normal o preventa), el recargo VIP, los combos con entrada, las entradas gratis y los cargos de servicio. El mapa de butacas, el candy y el checkout usan las mismas funciones.

6. **Cálculo del total.** Entradas + candy + cargos − entradas cubiertas por combos o canjes − cupón (%) − crédito a favor = monto a pagar con tarjeta. Ese monto da 1 punto por peso.

7. **Fechas tipeadas, sin calendario** (pedido del cliente en el mail del 28/02). La directiva `appMascaraFecha` da formato mientras se escribe (`25122026` → `25/12/2026`). `shared/utils/fechas.ts` valida, por ejemplo rechaza el 31/02, y convierte al formato de la base.

8. **Tiempo real y concurrencia.** El mapa se suscribe a `postgres_changes` de `entradas`: si otra persona compra una butaca, se marca ocupada sin recargar. El índice único de la base es la garantía final: si dos personas pagan la misma butaca al mismo tiempo, la segunda recibe un error y se deshace su compra.

9. **Imágenes con drag & drop.** `app-image-dropzone` implementa `ControlValueAccessor`: sube la imagen a Supabase Storage (bucket `imagenes`) y guarda la URL pública en el formulario, como si fuera un input de texto.

10. **Log de actividad.** `LogService.registrar(acción, entidad, id, detalle)` se llama en cada alta o edición del panel, en los cambios de precio y en cada validación de QR.

11. **Carga diferida de librerías pesadas.** jsPDF, jspdf-autotable y ExcelJS se importan con `import()` dinámico recién cuando se exporta, así no pesan en la carga inicial.

12. **Roles configurables.** Hay roles base (`cliente`, `empleado_cine`, `empleado_candy`, `admin`) y roles configurables (tabla `roles`), que son una lista de claves de secciones. `PermisosService` arma los permisos efectivos; `permisoGuard('reportes')` protege cada ruta y la barra lateral muestra solo lo permitido. La gestión de roles queda reservada al rol base `admin`.

13. **Cancelación atómica de funciones.** No se hace desde Angular con varias llamadas, porque si una fallara quedaría a medias. Es una función PL/pgSQL (`cancelar_funcion`) que corre en una sola transacción: bloquea la función (`for update`), recorre las compras, acredita el total (lo pagado + el crédito usado, incluido el candy), descuenta los puntos ganados, cancela entradas y candy, notifica, cierra la lista de espera y registra el log. Ante cualquier error lanza una excepción y PostgreSQL revierte todo.

14. **Lista de espera con turnos de 15 minutos.** La lógica vive en `procesar_listas_espera`. Cuando se liberan butacas, avisa al primero (`for update skip locked`) y le reserva una butaca hasta `vence_en`. En el mapa, las butacas reservadas no las puede tomar nadie más. Se ejecuta al cancelar una compra, al abrir el mapa o el perfil, y cada minuto con `pg_cron`.

15. **Notificaciones push.** La base inserta en `notificaciones`. Con la app abierta, Supabase Realtime las muestra en la campanita y como notificación del sistema. Con la app cerrada, un Database Webhook dispara la Edge Function `enviar-push`, que manda Web Push (VAPID) a los dispositivos suscriptos con `SwPush`.

16. **Fuera de alcance.** El mapa del cine con la ubicación de la sala (mail del 30/01) no se implementó, porque el cliente aclaró que todavía no tenía luz verde.

---

## Instalación y uso local

**Requisitos:** Node.js 22 o superior, npm y Angular CLI (`npm i -g @angular/cli`).

```bash
git clone https://github.com/Sergio-Dario-Moyano/PrimerTPP4.git
cd PrimerTPP4
npm install
ng serve
```

Abrir http://localhost:4200.

**Base de datos:** en Supabase → SQL Editor, ejecutar **una sola vez** `supabase/migraciones/001_correcciones_tp.sql`. Agrega las columnas y tablas nuevas, el bucket de imágenes, el trigger del Top 3 y el índice de butacas. No borra datos.

| Script | Qué hace |
|---|---|
| `npm start` | Servidor de desarrollo (`ng serve`) |
| `npm run build` | Build de producción en `dist/cineutnApp/browser`, con service worker |
| `npm test` | Tests unitarios |

---

## Usuarios y roles

| Rol | Puede |
|---|---|
| `cliente` | Comprar, reseñar, sumar y canjear puntos (es el rol por defecto al registrarse) |
| `empleado_cine` | Validar entradas en la sala |
| `empleado_candy` | Entregar productos del candy |
| `admin` | Todo el panel de administración |

Los usuarios se registran desde la app. El rol se asigna en Supabase:

```sql
update perfiles set rol = 'admin'          where id = (select id from auth.users where email = 'admin@…');
update perfiles set rol = 'empleado_cine'  where id = (select id from auth.users where email = 'cine@…');
update perfiles set rol = 'empleado_candy' where id = (select id from auth.users where email = 'candy@…');
```

---

## PWA

- **Instalable:** manifest con íconos propios, botón "Instalar" dentro de la app y acceso desde la pantalla de inicio.
- **Caché:**
  - la app se precarga completa;
  - las imágenes de Supabase usan la estrategia *performance* (caché primero, 7 días);
  - la cartelera usa la estrategia *freshness* (red primero, caché si no hay conexión).
- **Avisos:** "Hay una versión nueva" (con botón para actualizar) y "Sin conexión".

El service worker **solo corre en el build de producción**. Para probarlo en local:

```bash
ng build
npx http-server dist/cineutnApp/browser -p 8080
```

Después, en Chrome → DevTools → Application, revisar el Manifest y el Service Worker. Para probar el modo sin conexión: Network → Offline.

---

## Notificaciones push (configuración)

Las notificaciones funcionan siempre en la campanita y, con permiso, como notificación del sistema mientras la app está abierta. Para recibirlas **con la app cerrada** (Web Push):

1. Generar las claves: `npx web-push generate-vapid-keys`.
2. Poner la clave **pública** en `src/app/core/services/environments/environment.ts` → `vapidPublicKey`.
3. En Supabase → Edge Functions → Secrets, cargar `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` (ej. `mailto:admin@cinelanus.com`).
4. Desplegar la función: `supabase functions deploy enviar-push --no-verify-jwt`, o crearla desde el Dashboard pegando `supabase/functions/enviar-push/index.ts`.
5. En Database → Webhooks, crear uno sobre `notificaciones` (evento INSERT) que llame a la función `enviar-push`.
6. En la app, abrir la campanita → "Activar notificaciones push" (solo funciona en el build de producción, en HTTPS).

## Deploy

La app está en **Firebase Hosting**. Subir el código a GitHub **no** despliega solo: hay que hacer las dos cosas.

```bash
# 1. Código a GitHub
git add -A
git commit -m "mensaje"
git push

# 2. Deploy a Firebase
ng build
firebase deploy
```

`firebase.json` publica `dist/cineutnApp/browser` y redirige todas las rutas a `index.html`, para que funcionen los links directos y la recarga en cualquier página.
