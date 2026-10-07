# CineLanús (`cineutnApp`) 🎬

Aplicación web moderna y de alta concurrencia desarrollada como Trabajo Final Integrador, orientada a la gestión integral de un complejo de cines (cartelera, selección de butacas con sincronización en tiempo real, confitería/candy bar, pasarela de pago, cupones dinámicos, programa de fidelización y panel de administración).

## 🏗️ Arquitectura y Decisiones Técnicas

El proyecto ha sido diseñado bajo estrictos estándares de ingeniería de software moderna, priorizando el rendimiento, la escalabilidad, la mantenibilidad y la tipificación estricta.

### 1\. Arquitectura Standalone (Sin `NgModule`)

-   **Decisión:** Se prescindió por completo del tradicional archivo `app.module.ts` y de la arquitectura basada en `NgModules` heredada de versiones antiguas de Angular.
-   **Justificación:** La aplicación arranca directamente mediante `bootstrapApplication`y utiliza **Standalone Components**. Cada componente declara explícitamente sus dependencias directas en su arreglo `imports`, lo que optimiza de forma drástica el *Tree Shaking* en tiempo de compilación y reduce significativamente el peso inicial del bundle.

### 2\. Reactividad Moderna basada en Signals

-   **Decisión:** Adopción masiva de `signal()`, propiedades derivadas con `computed()` y efectos con `effect()`, minimizando la dependencia de RxJS y eliminando el ciclo de detección de cambios tradicional de Zone.js.
-   **Justificación:** Las señales proporcionan una reactividad granular (*fine-grained reactivity*). Ante un cambio de estado local (como la actualización de un contador de carrito o la selección de butacas), Angular actualiza quirúrgicamente únicamente el nodo del DOM enlazado, logrando un rendimiento superior y un código más predecible.

### 3\. Tipado Estricto en TypeScript (Cero `any`)

-   **Decisión:** Implementación de contratos de datos estrictos mediante interfaces dedicadas para cada capa de la aplicación (modelos de inserción `*Insert`, respuestas crudas de base de datos `Raw*`, entidades de dominio y uniones de tipos o *Union Types*).
-   **Justificación:** Se eliminó por completo el uso del tipo genérico `any` (salvo adaptaciones de tipado seguras en respuestas de librerías externas o Supabase). Esto garantiza la validación de tipos en tiempo de compilación, previene errores en tiempo de ejecución y mejora la autocompletación en el IDE.

### 4\. Principio de Responsabilidad Única (SRP) y Servicios de Datos

-   **Decisión:** Desacoplamiento total entre las vistas de usuario y la persistencia de datos. Los componentes jamás ejecutan consultas SQL o llamadas directas a la base de datos.
-   **Justificación:** Toda la lógica de negocio, autenticación, consultas relacionales complejas (`SELECT` con uniones `!inner`) y mutaciones están encapsuladas en servicios especializados ubicados en `core/services/`. Estos servicios consumen un cliente centralizado de Supabase configurado como proveedor raíz (`providedIn: 'root'`).

### 5\. Enrutamiento SPA, Lazy Loading y Route Guards Funcionales

-   **Decisión:** Configuración de rutas basadas en funciones modernas, implementación de *Lazy Loading* con `loadComponent` para todos los módulos y uso de *Guards* funcionales tipados como `CanActivateFn`.
-   **Justificación:**
-   -   El *Lazy Loading* fragmenta la aplicación en chunks descargados bajo demanda únicamente cuando el usuario navega a una URL específica, mejorando el tiempo de carga inicial.
    -   Los *Guards* funcionales (`authGuard`, `adminGuard`) evitan el *boilerplate* de las antiguas clases interceptoras, utilizando la función moderna `inject()` para resolver dependencias de forma limpia y proteger las rutas privadas y de administración.

### 6\. Sincronización en Tiempo Real (Supabase Realtime)

-   **Decisión:** Integración de canales de escucha activa de base de datos (`supabase.channel`).
-   **Justificación:** Permite que el mapa de butacas del cine se actualice de manera concurrente y en tiempo real ante eventos `INSERT`, `UPDATE` o `DELETE` en la tabla de entradas, evitando conflictos de sobreventa cuando múltiples usuarios intentan reservar asientos simultáneamente.

## 🚀 Requisitos Técnicos y Tecnologías Utilizadas

-   **Frontend:**
-   -   **Angular** (Componentes Standalone).
    -   **Signals, Computed & Effects** (Gestión de estado reactivo).
    -   **Reactive Forms & Custom Validators** (`FormGroup`, `FormControl`, `ValidatorFn`).
-   **Backend y Base de Datos:**
-   -   **Supabase** (PostgreSQL, Autenticación y Realtime).
-   **Librerías Externas:**
-   -   `angularx-qrcode` (Generación de códigos QR).
    -   `html2canvas` & `jspdf` (Exportación de comprobantes a PDF).

## 📋 Características Principales del Sistema

1.  **Cartelera Interactiva y Catálogo:** Filtros por género, buscador en tiempo real y sección **Top 3** calculada reactivamente por volumen de ventas.
2.  **Mapa de Butacas en Tiempo Real:** Selección de asientos (Estándar, VIP y Accesibles) con bloqueo concurrente mediante WebSockets de Supabase.
3.  **Módulo de Confitería (Candy Bar):** Compra de combos y productos asociados al mismo código QR del ticket.
4.  **Pasarela de Pago y Cupones:** Validación de tarjetas, cargos de servicio y cupones dinámicos con restricciones demográficas por edad (+50 años).
5.  **Programa de Fidelización y Perfil:** Acumulación de puntos por peso gastado, historial de entradas, películas vistas, canjes y gestión de créditos por cancelación anticipada.
6.  **Panel de Administración y Seguridad:** Módulo exclusivo protegido por roles (`adminGuard`) para la alta de películas y control operativo.

## 🛠️ Instalación y Configuración del Proyecto

### 1\. Clonar el repositorio

Bash

git clone https://github.com/tu-usuario/cineutnApp.git  
cd cineutnApp/cineutnApp  

### 2\. Instalar dependencias

Bash

npm install  

### 3\. Configurar entorno

Verifica las credenciales en `src/environments/environment.ts`:

TypeScript

export const environment = {  
  production: false,  
  supabaseUrl: 'TU\_SUPABASE\_URL',  
  supabaseKey: 'TU\_SUPABASE\_ANON\_KEY'  
};  

### 4\. Ejecutar en desarrollo

Bash

ng serve  

Accede a `http://localhost:4200/`.

## 🧭 Estructura General del Proyecto

Plaintext

src/app/  
├── core/  
│   ├── guards/          # Guards funcionales de autenticación y roles\[cite: 2, 3\]  
│   ├── models/          # Interfaces y contratos estrictos en TypeScript\[cite: 4, 17, 27\]  
│   └── services/        # Lógica de negocio y cliente de Supabase\[cite: 30, 32, 33\]  
├── directives/  
│   └── admin-accion.ts  # Directiva de atributo con Renderer2 y HostListener\[cite: 39\]  
├── features/  
│   ├── admin/           # Panel de gestión y alta de películas\[cite: 41\]  
│   ├── auth/            # Inicio de sesión y registro con validadores de edad\[cite: 43\]  
│   ├── profile/         # Panel de usuario (entradas, puntos, canjes, cupones)\[cite: 45\]  
│   └── public/          # Vistas públicas (Cartelera, Detalle, Butacas, Candy, Checkout, Ticket)\[cite: 57, 61, 63, 65, 67\]  
├── shared/  
│   ├── components/      # Componentes reutilizables (Navbar, Modal global, Resumen)\[cite: 73, 74, 77\]  
│   └── validators/      # Validadores síncronos personalizados\[cite: 78\]  
├── app.routes.ts        # Enrutamiento SPA con Lazy Loading y rutas hijas\[cite: 81\]  
└── app.config.ts        # Proveedores globales de la aplicación Standalone\[cite: 79\]
