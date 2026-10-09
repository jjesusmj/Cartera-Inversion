# Cartera — seguimiento de inversiones

App personal de seguimiento de cartera: posiciones compradas + watchlist con
comentarios, rendimiento del día y desde compra, resumen global de P/L, y
resumen fiscal de ventas (FIFO + tipo de cambio BCE) exportable a Excel.

## 1. Firebase (guarda tus posiciones, comentarios y ventas)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Crear proyecto** (gratis, plan Spark).
2. En el menú lateral, **Firestore Database** → **Crear base de datos** → modo producción → la región que prefieras.
3. En **Configuración del proyecto** (icono de engranaje) → **Tus apps** → añade una app **Web** → copia los valores que te da (`apiKey`, `authDomain`, etc.).
4. Instala la CLI de Firebase (`npm install -g firebase-tools`), `firebase login`, `firebase init firestore` (elige tu proyecto), y despliega las reglas incluidas: `firebase deploy --only firestore:rules`.

## 2. Datos de mercado (sin claves)

- **Cotizaciones, gráfico del día, rangos, sector y buscador**: Yahoo Finance
  (es.finance.yahoo.com), a través de las funciones `api/prices.js`,
  `api/chart.js` (gráfico por periodos), `api/profile.js` (sector) y
  `api/search-symbol.js`. EE. UU. en tiempo real; bolsas
  europeas con unos 15 minutos de retraso. Es una API no oficial: si un día
  falla, la app usa el precio manual de cada valor.
- **Tipo de cambio**: tipo de referencia del BCE vía Frankfurter.

Para comprobar lo que devuelve Yahoo para un valor:
`/api/prices?symbols=BKNG&currencies=USD&debug=1`

## Valoración por FCF (pestaña Valoración)

Niveles de compra y venta a 5 años por flujo de caja libre, con las acciones de
Cartera y de Seguimiento (filtro Todas / Cartera / Seguimiento / Favoritos).
Fórmulas: `src/lib/valoracionFCF.js`. Datos: `api/fundamentals.js`.

- **EE. UU.**: SEC EDGAR (companyfacts). La SEC exige identificarse: añade en
  Vercel la variable `SEC_USER_AGENT` con tu nombre y email (por ejemplo
  `Cartera Juan tu@email.com`). Sin ella se usa Yahoo.
- **Resto de bolsas**: Yahoo Finance (fundamentals-timeseries, no oficial).
- **Crecimiento**: solo el histórico del FCF por acción (× 0,7, tope 15 %). No se usan estimaciones de analistas.
- **Mediana P/FCF**: 10 años de trimestres con EDGAR; con Yahoo, los años que dé (unos 4).
- Bancos y aseguradoras salen como "No valorable por FCF".
- Fundamentales guardados en Firestore (`fundamentals`), se renuevan cada 7 días
  o con "Actualizar datos". Ajustes manuales en `valuationAdjustments` y
  parámetros en `settings/valoracion_<titular>`, por titular.

Comprobar una acción: `/api/fundamentals?symbol=NFLX&currency=USD&market=us&debug=1`.
Pruebas del cálculo (casos de la especificación): `npm test`.

## 3. Desplegar en Vercel

1. Sube esta carpeta a un repo de GitHub (por ejemplo `jjesusmj/cartera-app`).
2. En [vercel.com](https://vercel.com) → **Add New Project** → importa el repo.
3. En **Environment Variables**, añade las seis `VITE_FIREBASE_*` del paso 1 (usa `.env.example` como plantilla).
4. Deploy. Vercel detecta Vite automáticamente.

## 4. Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellena las variables
npm run dev
```

Las APIs de datos (`/api/prices`, `/api/chart`, `/api/profile`, `/api/search-symbol`) son funciones serverless de Vercel:
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
- Los símbolos usan el formato de Yahoo Finance: sin sufijo en EE. UU. (`FN`)
  y con sufijo en Europa (`ITX.MC`, `ENI.MI`, `TEP.PA`). El buscador ya los
  devuelve así.