# Cartera — seguimiento de inversiones

App personal de seguimiento de cartera: posiciones compradas + watchlist con
comentarios, rendimiento del día y desde compra, resumen global de P/L, y
resumen fiscal de ventas (FIFO + tipo de cambio BCE) exportable a Excel.

## 1. Firebase (guarda tus posiciones, comentarios y ventas)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Crear proyecto** (gratis, plan Spark).
2. En el menú lateral, **Firestore Database** → **Crear base de datos** → modo producción → la región que prefieras.
3. En **Configuración del proyecto** (icono de engranaje) → **Tus apps** → añade una app **Web** → copia los valores que te da (`apiKey`, `authDomain`, etc.).
4. Instala la CLI de Firebase (`npm install -g firebase-tools`), `firebase login`, `firebase init firestore` (elige tu proyecto), y despliega las reglas incluidas: `firebase deploy --only firestore:rules`.

## 2. Twelve Data (cotizaciones, gratis)

1. Crea una cuenta en [twelvedata.com](https://twelvedata.com) → plan gratuito (800 peticiones/día, sin tarjeta).
2. Copia tu API key desde el dashboard.

No hace falta nada para el tipo de cambio: **Frankfurter** (datos del BCE) es gratis y no pide clave.

## 3. Desplegar en Vercel

1. Sube esta carpeta a un repo de GitHub (por ejemplo `jjesusmj/cartera-app`).
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repo.
3. En **Environment Variables**, añade las seis `VITE_FIREBASE_*` del paso 1 y `TWELVE_DATA_API_KEY` del paso 2 (usa `.env.example` como plantilla).
4. Deploy. Vercel detecta Vite automáticamente.

## 4. Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellena las variables
npm run dev
```

La API de cotizaciones (`/api/prices`) es una función serverless de Vercel:
para probarla en local usa `vercel dev` en lugar de `npm run dev` (necesita
`npm install -g vercel` y `vercel link` una vez).

## Cómo funciona el cálculo fiscal (pestaña Declaración)

- Cada compra es un **lote** independiente (fecha, cantidad, precio, comisión).
- Al vender, se consumen primero los lotes más antiguos — **FIFO**, obligatorio
  por el art. 37.2 de la Ley del IRPF para acciones cotizadas. Una venta parcial
  puede repartirse entre varios lotes.
- El coste de cada lote se convierte a euros con el tipo de cambio oficial
  (BCE) **del día de esa compra**; el importe de la venta, con el tipo de
  cambio **del día de la venta**. Son dos fechas distintas y por tanto dos
  tipos de cambio distintos, incluso dentro de una misma venta si consume
  varios lotes.
- El resumen de la pestaña **Resumen** (P/L no realizado) usa en cambio el
  tipo de cambio de **hoy** para coste y valor, porque ahí el objetivo es ver
  de un vistazo cuánto llevas ganado si vendieras ahora mismo — no tiene
  ningún efecto en la declaración, es solo para seguimiento.

## Cosas que quedan fuera de esta versión (avísame si las necesitas)

- **Dividendos**: no se registran. Tributan aparte, como rendimiento del
  capital mobiliario, no como ganancia patrimonial — es un módulo distinto.
- **Modelo 720/750**: si el valor en el extranjero supera 50.000 €, hay una
  obligación informativa aparte que esta app no cubre.
- **Alertas de precio**: no hay notificaciones, solo lo que ves al entrar.
- Los símbolos deben coincidir con el formato de Twelve Data (por ejemplo
  `ITX.MC`, `SAN.MC`, `ENI.MI`, no solo `ITX`). Si un símbolo no aparece,
  revisa el sufijo de bolsa en su web.
