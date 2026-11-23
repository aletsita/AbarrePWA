# Tendero · Web (caja)

La caja de Abarré: cobro, inventario, ventas, corte del día, dispositivos y configuración. Es una PWA instalable. Este proyecto incluye también el **servidor de sincronización** al que se conectan los celulares ([tendero-mobile](../tendero-mobile)).

Hecho con React 18, TypeScript, Ionic React 8, Vite 5 y vite-plugin-pwa. El servidor usa solo Node.js, sin dependencias.

## Requisitos

- Node.js 18 o superior
- Chrome o Edge recientes

## Desarrollo

Necesitas dos terminales:

```bash
npm install
npm run dev:server   # sincronización (/__sync) y API de la app del celular (/api) en http://0.0.0.0:8787
npm run dev          # caja en http://localhost:5173
```

En desarrollo, Vite reenvía la ruta `/__sync` al servidor (`server.proxy`). Si el servidor corre en otra dirección, defínela en `SYNC_PROXY_TARGET`.

Los celulares de la misma red se conectan directamente al servidor: `http://IP-de-tu-PC:8787/__sync`. No hace falta escribirla en ningún lado: el servidor imprime esa dirección al arrancar, y la caja la muestra y la mete en el QR de **Dispositivos → Vincular nuevo celular**. Si Windows pregunta por el firewall, permite el acceso de Node.js en redes **privadas**; si no, el celular no alcanza el servidor.

## Producción

```bash
npm run build          # genera dist/ con el service worker
npm run start:server   # sirve dist/ y /__sync en el mismo puerto
```

Basta un solo despliegue: el servidor sirve la web y la sincronización. Detrás de HTTPS (por ejemplo, un proxy inverso), define `PUBLIC_SYNC_URL=https://tu-dominio/__sync` para que el QR de vinculación lleve esa dirección en lugar de la IP local.

`npm run preview` también funciona: sirve `dist/` en http://localhost:4173 y reenvía `/__sync` al servidor, que debe estar corriendo.

### Variables de entorno

| Variable | Dónde | Por defecto | Uso |
|---|---|---|---|
| `PORT` | servidor | `8787` | Puerto del servidor |
| `HOST` | servidor | `0.0.0.0` | Interfaz donde escucha |
| `ALLOWED_ORIGINS` | servidor | `http://localhost:5173,http://localhost:5174,http://localhost,https://localhost,capacitor://localhost` y cualquier IP de red local (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`) | Orígenes con CORS permitido, separados por comas. `*` permite cualquiera. Si la defines, se usa solo tu lista. |
| `PUBLIC_SYNC_URL` | servidor | — | Dirección pública del servidor que va en el QR (por ejemplo detrás de HTTPS) |
| `DIST_DIR` | servidor | `dist` | Carpeta del build que se sirve |
| `SYNC_PROXY_TARGET` | Vite | `http://localhost:8787` | A dónde reenvía Vite `/__sync` |
| `VITE_SYNC_URL` | build de la web | `/__sync` | URL de sincronización, si no es la del mismo origen |

## Rutas

| Ruta | Pantalla |
|------|----------|
| `/` | Redirige a la caja |
| `/panel/login` | Iniciar sesión o crear cuenta |
| `/panel/caja` | Caja: búsqueda por código, cuenta en tiempo real y cobro |
| `/panel/pedidos` | Pide y recoge: pedidos de clientes por estado, preparación, entrega y cobro |
| `/panel/venta-completada` | Ticket de la venta |
| `/panel/inventario` | Productos, existencias y alta por código de barras |
| `/panel/ventas` | Historial de ventas y reimpresión de tickets |
| `/panel/clientes` | Clientes con crédito: saldos, límite y abonos |
| `/panel/corte` | Corte del día, movimientos de efectivo, Excel y PDF |
| `/panel/dispositivos` | Celulares vinculados y vinculación con QR |
| `/panel/configuracion` | Datos de la tienda, usuarios y roles, ticket |

## Uso

### Entrar a la caja

El acceso viene prellenado: `donpepe@correo.mx` (Dueño) con contraseña `abarre`; solo toca **Entrar**. Funciona cualquier contraseña de 4 caracteres o más, y un correo nuevo entra como Dueño. También existe `ana.lopez@correo.mx` (Cajero).

### Caja

- **Más vendidos**, debajo del buscador, agrega con un toque los productos que más salen.
- **Nueva cuenta** deja la cuenta actual en espera y abre otra; las pestañas de arriba cambian entre las cuentas abiertas.
- **A crédito**, al cobrar, carga la venta a la cuenta de un cliente; los abonos se registran en **Clientes**.

### Pide y recoge (vista previa)

Tus clientes piden desde su celular y pagan al recoger en tienda, en efectivo, con tarjeta o por transferencia. Los pedidos viven en los datos de la caja, igual que los productos. Al empezar hay uno de ejemplo en cada estado. Los clientes los hacen en la app del celular contra la API del servidor (`server/api.js`), que se los manda a la caja por el canal de sincronización (mensaje `ORDER_RECEIVED`, ver [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md)). **La caja tiene que estar abierta** para que lleguen.

- Las cuentas de la app y los pedidos de los clientes se guardan en `server/data/api.json` (no se sube a git). Para empezar de cero, apaga el servidor y borra esa carpeta.
- El personal entra a la app del celular con el **mismo correo** que tiene en **Ajustes → Usuarios**. Si el usuario está activo, la app le muestra las pantallas de la tienda; si no, entra como cliente.
- La **descripción** de cada producto (en **Inventario**, sección *Pide y recoge*) es lo que ven los clientes en el detalle.

- **Pedidos** es un tablero con tres columnas: *Pendientes*, *Preparando* y *Listos*, con el botón para pasar cada pedido a la siguiente etapa. Arriba se cambia a *Entregados hoy* y *Cancelados hoy*. El número del menú cuenta los pendientes. Cuando entra un pedido nuevo suena un aviso y aparece una alerta en cualquier pantalla. También se pueden preparar y entregar desde el celular de la tienda.
- Cada pedido avanza una etapa a la vez: **Empezar a preparar**, **Marcar listo** y **Entregar**.
- Si **se agotó un producto**, ⚠ en la tarjeta marca cuáles y el pedido **no se cancela**: queda *Esperando al cliente*, que en su app elige otro producto, quita lo agotado o cancela; el mismo pedido se actualiza. Por **otro motivo** sí se cancela, con un texto para el cliente. Los cancelados del día están en **Cancelados hoy**.
- El código de entrega solo acepta los 6 números (o el QR de un lector USB). Si la caja pierde internet o se cierra el turno, la app de clientes muestra la tienda cerrada y no deja pedir.
- **Para entregar se necesita el código del cliente.** Su app lo genera al confirmar el pedido y lo muestra como QR y 6 dígitos cuando el pedido está listo. En la caja, **Entregar** (o **Entregar con código**, que busca el pedido por el código) pide escribirlo o escanearlo con la cámara o con un lector USB. Después de 5 intentos fallidos se bloquea un minuto. Con el código correcto se abre el cobro de siempre, sin crédito. La entrega registra la venta una sola vez, descuenta existencias y permite imprimir el ticket.
- Para probar con los pedidos de ejemplo, estos son sus códigos: P-0002 `418362` (listo), P-0003 `529083`, P-0004 `771640` y P-0005 `305218`.
- Mientras un pedido no se entrega, sus piezas quedan apartadas. Si después se venden en mostrador y ya no alcanzan, el pedido lo avisa.
- **Ventas** filtra por origen (*En tienda* / *Pide y recoge*) y muestra el folio del pedido. **Corte** separa las ventas por origen en pantalla, en Excel y en la impresión.
- **Inventario → Mostrar en la app** decide si el producto aparece en el catálogo de los clientes.

### Vincular un celular

1. Conecta el celular a la **misma Wi‑Fi** que la computadora y deja corriendo `npm run dev:server`.
2. Abre **Dispositivos → Vincular nuevo celular**. Aparecen un QR, un código de 6 dígitos que vence en 5 minutos y la **dirección de la caja** (por ejemplo `192.168.1.20:8787`). Si la computadora tiene varias redes, elige en la lista la del celular; el QR se actualiza solo.
3. En la app del celular, en **Vincular con la caja**:
   - **Código QR**: apunta la cámara al QR. Trae la dirección y el código, así que se conecta solo.
   - **Escribir código**: escribe la dirección y los 6 dígitos.
4. La caja detecta el celular al instante y lo muestra como **Conectado**.

Si el modal avisa que la caja no está conectada al servidor, enciéndelo con `npm run dev:server`. Si el celular dice «La caja no respondió», revisa que esté en la misma Wi‑Fi y el permiso del firewall de Windows para Node.js.

### Trabajar sin conexión

Sin internet, los cambios (productos y ventas) se guardan en el navegador con el estado **Pendiente de subir**. Al volver la conexión se suben solos.

## Sincronización

El protocolo (endpoints, mensajes, versión de datos y claves de `localStorage`) está documentado en [SYNC_PROTOCOL.md](SYNC_PROTOCOL.md). Es el contrato con la app del celular: si cambias el protocolo, actualiza los dos proyectos.

## Estructura

```
server/index.js           servidor de sincronización (y de dist/ en producción)
src/
├─ App.tsx                rutas
├─ context/AppContext.tsx estado, sincronización y cola sin conexión
├─ data/                  modelos y datos iniciales de la tienda
├─ hooks/                 reloj
├─ lib/                   sincronización, búsqueda, impresión y Excel, fotos, tema
├─ components/            buscador por código, estados de sincronización, etc.
├─ panel/                 menú, barra superior y pantallas de la caja
└─ theme/                 colores y estilos globales
```

## Pago en línea (Stripe, solo modo de pruebas)

El pago de los pedidos de la app se hace con Stripe Checkout: la tarjeta se escribe en la página de Stripe y nunca pasa por la app ni por el servidor. Las claves viven **solo** en variables de entorno del servidor (`.env` está en `.gitignore`); el servidor no acepta claves que no sean de prueba (`sk_test_…`).

1. Copia `.env.example` como `.env` y pon tu clave de pruebas (`STRIPE_SECRET_KEY=sk_test_…`, de https://dashboard.stripe.com/test/apikeys).
2. Instala la Stripe CLI (`winget install Stripe.StripeCli`), entra con `stripe login` y deja corriendo:
   `stripe listen --forward-to localhost:8787/api/pagos/webhook`. Copia el `whsec_…` que imprime en `STRIPE_WEBHOOK_SECRET`.
3. `npm run start:server` (lee el `.env` solo). Al arrancar dice «Pago en línea: Stripe en modo de pruebas» o qué falta.

Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC. Rechazada: `4000 0000 0000 0002`.

Pruebas del servidor (inventario, carrera por la última pieza, webhook, código para recoger): `npm test`.
