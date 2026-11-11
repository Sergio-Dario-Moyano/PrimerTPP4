import { ApplicationConfig, LOCALE_ID, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';

// Fechas, días y montos en español de Argentina (ej. "lun 25/12", "$ 5.000")
registerLocaleData(localeEsAr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-AR' },
    // PWA: el service worker solo se activa en el build de producción (ng build / deploy)
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};













// import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
// import { registerLocaleData } from '@angular/common';
// import localeEsAr from '@angular/common/locales/es-AR';
// import { provideRouter } from '@angular/router';
// import { routes } from './app.routes';

// // Fechas, días y montos en español de Argentina (ej. "lun 25/12", "$ 5.000")
// registerLocaleData(localeEsAr);

// export const appConfig: ApplicationConfig = {
//   providers: [
//     provideBrowserGlobalErrorListeners(),
//     provideRouter(routes),
//     { provide: LOCALE_ID, useValue: 'es-AR' }
//   ]
// };
