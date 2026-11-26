# Tendero · Web (caja)

La caja de Abarré: cobro, inventario, ventas, corte del día, dispositivos y configuración. Es una PWA instalable que trabaja contra **[AbarreAPI](../AbarreAPI)** (ASP.NET Core + PostgreSQL), la misma API que usa la app del celular. La base de datos de la API es la fuente de verdad.

Hecho con React 18, TypeScript, Ionic React 8, Vite 5, vite-plugin-pwa y `@microsoft/signalr`.

> La carpeta `server/` es el servidor de Node anterior. Ya no se usa: lo reemplazó AbarreAPI.

## Cómo se conecta con la API

- **Entrar:** `POST /api/auth/entrar` con una cuenta de **personal** (Dueño, Cajero o Inventario). Las cuentas de cliente no entran a la caja.
- **Datos:** al entrar descarga todo con `GET /api/sync/cambios?desde=0` (tienda, usuarios, cajas, productos, clientes con crédito) y además el turno abierto de su caja, las ventas de 30 días, los cortes, los pedidos, los celulares y los movimientos. Lo guarda en el navegador para seguir trabajando sin internet.
- **Cobrar:** con conexión, `POST /api/ventas` (el servidor revisa la existencia: `409 sin-stock` dice qué falta). Sin conexión, la venta se cobra y entra a una **cola** que sube sola con `POST /api/sync/subir` cuando vuelve el internet, igual que abonos, gastos, apertura y cierre de turno, clientes y productos.
- **En vivo (SignalR, `/hubs/tienda`):** pedidos nuevos y sus cambios, productos que manda el celular, cambios del catálogo y la existencia, y qué celulares están conectados. La caja publica sus cuentas abiertas para que el celular elija a cuál mandar.
- **Pide y recoge:** preparar, avisar de un agotado, cancelar y entregar van directo a la API (requieren conexión). El código para recoger nunca llega a la caja: lo revisa el servidor (`POST /api/gestion/pedidos/buscar-codigo` y `.../entregar`).
- **Roles:** los decide la API. El Cajero cobra pero no edita productos; solo el Dueño cambia la configuración, los usuarios y genera códigos de vinculación.

## Requisitos

- Node.js 18 o superior
- Chrome o Edge recientes
- AbarreAPI corriendo (ver su README)

## Desarrollo

```bash
# Terminal 1: la API (en AbarreAPI/AbarreAPI)
dotnet run --launch-profile http     # http://0.0.0.0:8787

# Terminal 2: la caja
npm install
npm run dev                          # http://localhost:5173
```

En desarrollo la caja usa la API en el mismo origen: Vite reenvía `/api`, `/hubs` (WebSocket), `/archivos` (fotos) y `/__sync` a `http://localhost:8787`. Si la API corre en otra dirección, defínela en `API_PROXY_TARGET`.

Entra con `donpepe@correo.mx` / `abarre123` (Dueño) o `ana.lopez@correo.mx` / `abarre123` (Cajero), las cuentas de la semilla de la API.

Los celulares de la misma red se conectan directamente a la API: `http://IP-de-tu-PC:8787`. La caja muestra esa dirección y la mete en el QR de **Dispositivos → Vincular nuevo celular** (la saca de `GET /__sync/info` de la API). Si Windows pregunta por el firewall, permite el puerto 8787 en redes **privadas**.

## Producción

```bash
VITE_API_URL=https://api.midominio.com npm run build   # genera dist/ con el service worker
```

Sube `dist/` a cualquier hosting estático con HTTPS y agrega su origen a `Cors__Origenes` de la API. Si sirves la caja y la API en el mismo dominio (un proxy que mande `/api`, `/hubs` y `/archivos` a la API), deja `VITE_API_URL` vacía.

### Variables de entorno

| Variable | Dónde | Por defecto | Uso |
|---|---|---|---|
| `VITE_API_URL` | build de la web | vacía (mismo origen) | Dirección de AbarreAPI |
| `API_PROXY_TARGET` | Vite (desarrollo) | `http://localhost:8787` | A dónde reenvía Vite `/api`, `/hubs`, `/archivos` y `/__sync` |

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
   `stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed --forward-to localhost:8787/api/pagos/webhook`. Copia el `whsec_…` que imprime en `STRIPE_WEBHOOK_SECRET`.
3. `npm run start:server` (lee el `.env` solo). Al arrancar dice «Pago en línea: Stripe en modo de pruebas» o qué falta.

Tarjeta de prueba: `4242 4242 4242 4242`, cualquier fecha futura y cualquier CVC. Rechazada: `4000 0000 0000 0002`.

Pruebas del servidor (inventario, carrera por la última pieza, webhook, código para recoger): `npm test`.
