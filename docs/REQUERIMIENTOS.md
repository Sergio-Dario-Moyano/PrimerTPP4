# CineLanús · Documento de requerimientos

Resumen de todos los pedidos del cliente ("Empresario Importante"), tomados del intercambio de mails de la consigna del TP 1 de Programación IV. Cada requerimiento indica el mail de origen y dónde quedó resuelto en la aplicación.

**Contexto:** un cine de un solo edificio con varias salas necesita su propio sitio para vender entradas y productos del candy bar, con un panel de administración y herramientas para los empleados.

---

## 1. Requerimientos generales y técnicos (consigna)

| ID | Requerimiento | Dónde se resolvió |
|---|---|---|
| G-01 | Aplicación hecha con Angular, aplicando los temas vistos en clase y buenas prácticas | Todo el proyecto (ver README, "Decisiones técnicas") |
| G-02 | Integración con Supabase | Base de datos, autenticación, Realtime, Storage, RPC y Edge Function |
| G-03 | Integración de PWA | `ngsw-config.json`, `manifest.webmanifest`, `PwaService` |
| G-04 | Aplicación desplegada con URL funcional | Firebase Hosting: https://cineutnprogramacion4.web.app |
| G-05 | Código en GitHub y README con arquitectura y decisiones técnicas | Este repositorio y `README.md` |
| G-06 | Estilo visual propio y producido | Estilos globales y por componente |
| G-07 | Interfaces fáciles de navegar para clientes y empleados (mail 28/02) | Navbar, panel por secciones, flujo de compra en pasos |

---

## 2. Películas y cartelera

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| P-01 | El cine elige qué películas aparecen en la página | 01/01 | Admin → Películas (estado: cartelera / próximamente / archivada) |
| P-02 | Toda película tiene duración, imagen, nombre y sinopsis | 01/01 | Formulario de películas; póster y banner con arrastrar imagen |
| P-03 | La página principal muestra primero las 3 películas más vendidas | 16/01 | Cartelera (`top3Peliculas`, trigger `actualizar_entradas_vendidas`) |
| P-04 | El listado tiene buscador | 16/01 | Cartelera (`peliculasFiltradas`) |
| P-05 | El buscador filtra por género; una película puede tener varios géneros | 16/01 | Tablas `generos` y `pelicula_genero`; filtro en la cartelera |
| P-06 | Restricción de edad (+13, +18 o ninguna): los menores no pueden comprar y la entrada aclara que debe ir un adulto | 12/02 | Modal de edad en el mapa de butacas y aviso en el ticket |
| P-07 | Sección "Próximamente" con los estrenos de las próximas semanas | 08/03 | Ruta `/proximamente` |
| P-08 | Alerta para avisar al usuario cuando salen a la venta las entradas de un estreno | 08/03 | Tabla `alertas_estrenos` y notificaciones |
| P-09 | Preventa: venta 7 días antes del estreno con precio especial, configurable por película; después vuelve el precio normal | 08/03 | Campos de preventa en la película y `core/utils/precios.ts` |
| P-10 | Los clientes pueden proponer películas que no están en cartelera (una propuesta a la vez: título, descripción y motivo) | 10/03 (2) | Perfil → Mi propuesta |
| P-11 | El admin ve las propuestas y las acepta o rechaza; al aceptar, abre el alta de película con los datos de la propuesta | 10/03 (2) | Admin → Propuestas |

## 3. Funciones y salas

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| F-01 | Cada función tiene horario, formato (2D, 3D, 4D o 5D) e idioma (castellano o subtitulada) | 01/01 | Admin → Funciones |
| F-02 | No puede haber una función antes de que pasen 30 minutos desde el fin de la anterior en la misma sala | 01/01 | `FuncionesService` y trigger `funciones_sin_superposicion` (migración 003) |
| F-03 | La sala se asigna automáticamente y bajo ningún término dos funciones coinciden en la misma sala | 06/02 | `FuncionesService.buscarSalaLibre` + trigger en la base |
| F-04 | Programar una película en días de la semana repetidos (ej. lunes, martes y viernes a las 18 h) | 06/02 | Modo "repetidas" en Admin → Funciones |
| F-05 | Fechas y horas se ingresan sin calendarios con mucho scroll | 28/02 | Directiva `appMascaraFecha` (se tipean los números) |
| F-06 | El cine puede cancelar una función completa: todo lo vendido (incluido el candy) pasa a crédito, se liberan las butacas, se notifica a cada comprador y se le ofrece reubicarse en otra función de la misma película. Todo de forma atómica | 10/03 (2) | RPC `cancelar_funcion` (una sola transacción) |

## 4. Butacas

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| B-01 | Todas las salas tienen 20 filas identificadas con letras y 3 bloques de 4, 20 y 4 butacas | 01/01 | Tabla `butacas` y mapa de butacas |
| B-02 | Las filas J y K se quitaron para dar lugar a una fila para personas con discapacidad, con 2, 10 y 2 butacas | 12/02 | Fila J accesible, fila K como separación |
| B-03 | Las butacas accesibles se resaltan de forma diferente | 12/02 | Estilo propio en el mapa (♿) |
| B-04 | Las butacas se ven en tiempo real: quien está eligiendo ve las que otra persona acaba de comprar | 12/02 | Supabase Realtime en `book-seats` + índice único en la base |
| B-05 | Butacas VIP en las filas R, S y T, con precio más alto, marcadas en el mapa; el usuario sabe que compra una VIP antes de pagar | 10/03 | Recargo VIP configurable, estilo propio (★) y aviso en el resumen |

## 5. Compra, pago y entradas

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| C-01 | Los clientes compran entradas desde la página | 01/01 | Flujo detalle → butacas → candy → checkout → ticket |
| C-02 | Se puede comprar sin registrarse | 01/01 | Checkout con email de contacto |
| C-03 | Se genera un PDF con los datos de la entrada y un QR | 01/01 | Ticket con QR y descarga en PDF |
| C-04 | Con el mismo QR se retira el candy | 30/01 | Un único `codigo_ticket` por compra |
| C-05 | Cancelar una compra hasta 2 horas antes de la función; no se devuelve dinero sino crédito en la cuenta | 10/03 | Pantalla del ticket (se llega desde Perfil → Mis entradas) |
| C-06 | El crédito aparece en el perfil y se puede usar junto con otros medios de pago | 10/03 | Perfil y checkout |

## 6. Candy bar

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| D-01 | Venta de productos del candy (pochoclos, bebidas, etc.) junto con la entrada | 30/01 | Paso "Confitería" de la compra y pestaña `/candy` |
| D-02 | El admin crea productos y los organiza en categorías | 30/01 | Admin → Candy Bar y Combos |
| D-03 | Combos especiales (entrada + pochoclos + bebida) a precio fijo configurable, destacados en la página de compra | 03/03 | Combos con o sin entrada, marca de destacado |

## 7. Usuarios, beneficios y fidelización

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| U-01 | Registro con email, nombre, apellido, fecha de nacimiento, tipo de sangre, color de ojos y días de vacaciones por año | 01/01 | Formulario de registro con validaciones |
| U-02 | Cupón de bienvenida del 20 % en la primera compra | 01/01 | Cupón de bienvenida en el perfil y el checkout |
| U-03 | El porcentaje del cupón de bienvenida se puede configurar | 30/01 | Admin → Cupones |
| U-04 | Cupones que solo puedan usar clientes de más de 50 años | 30/01 | Cupones con marca `solo_mayores_50` |
| U-05 | Reseñas: cada persona califica cada película con estrellas y deja un comentario corto, visible antes de comprar | 16/01 | Detalle de película |
| U-06 | Puntaje promedio de cada película | 16/01 | Detalle de película (`promedioEstrellas`) |
| U-07 | Programa de puntos: 1 punto por cada peso gastado por usuarios registrados | 03/03 | Checkout y `FidelizacionService` |
| U-08 | Los puntos se canjean por entradas gratis o productos del candy; el admin configura cuántos puntos cuesta cada recompensa | 03/03 | Admin → Puntos y Canjes, Perfil → Puntos |
| U-09 | El perfil muestra los puntos acumulados y el historial de canjes; los puntos no se transfieren | 03/03 | Perfil → Puntos y Perfil → Canjes |
| U-10 | "Mis películas": historial visual con pósters, fechas y la calificación propia | 08/03 | Perfil → Mis películas |
| U-11 | Lista de espera en funciones agotadas para usuarios registrados; si se liberan butacas, se avisa por push al primero, que tiene 15 minutos para comprar antes de que pase al siguiente | 10/03 (2) | Tabla `lista_espera`, RPC `procesar_listas_espera` (un turno a la vez; duración configurable en el admin), notificaciones push |
| U-12 | El usuario ve en su perfil en qué listas de espera está y en qué posición | 10/03 (2) | Perfil → Listas de espera |

## 8. Empleados y administración

| ID | Requerimiento | Mail | Dónde se resolvió |
|---|---|---|---|
| A-01 | Un usuario administrador controla salas, funciones, butacas, productos, etc. | 06/02 | Panel `/admin` |
| A-02 | Usuarios para empleados que escanean los QR, tanto en la sala como en el candy | 06/02 | Roles `empleado_cine` y `empleado_candy`, Admin → Validar QR |
| A-03 | El código se puede ingresar a mano si el lector no funciona | 06/02 | Validador: campo de código manual |
| A-04 | Una vez validada la entrada o entregada la comida, el QR deja de funcionar | 06/02 | Estados `validada` y `entregado`, por sector |
| A-05 | Reporte de facturación por día y cantidad de entradas vendidas | 28/02 | Admin → Reportes |
| A-06 | Exportar el reporte de facturación a PDF y Excel | 10/03 | jsPDF y ExcelJS en Reportes |
| A-07 | Gráficos de las películas más vistas por semana y por mes, y del producto del candy más vendido | 10/03 | Admin → Reportes (Chart.js) |
| A-08 | Log de actividad: quién creó qué función, quién cambió un precio, quién validó un QR, con fecha y hora | 10/03 | Admin → Log de Actividad (`LogService`) |
| A-09 | Roles configurables con acceso solo a ciertas secciones del panel (ej. solo Reportes) y asignación a usuarios | 10/03 (2) | Admin → Roles y Permisos, `permisoGuard` |
| A-10 | El admin ve cuánta gente hay en lista de espera por función | 10/03 (2) | Admin → Funciones |

## 9. Fuera de alcance

| ID | Pedido | Mail | Motivo |
|---|---|---|---|
| X-01 | Mapa del cine que indique en qué sala es la función comprada | 30/01 | El cliente aclaró que todavía no tenía luz verde |
