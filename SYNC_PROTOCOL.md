# Protocolo de sincronización caja ↔ celular

Contrato entre **tendero-web** (la caja y el servidor) y **tendero-mobile** (la app del celular). Los dos proyectos tienen su propia copia del código que lo implementa (`src/lib/sync.ts` y `src/context/AppContext.tsx`). Si cambias algo de este documento, cámbialo en los dos proyectos y en las dos copias de este archivo.

- **Versión del formato de datos:** `5` (constante `VERSION` en `AppContext.tsx`)
- **Canal:** `tendero` (nombre del `BroadcastChannel`)

## Transporte

El servidor (`server/index.js` en tendero-web) solo reenvía mensajes: no los guarda ni los interpreta. Cada cliente recibe lo que publica cualquier cliente, también lo que publicó él mismo, y descarta lo suyo comparando `from`.

### `GET /__sync`: recibir (Server-Sent Events)

- Responde `200` con `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform` y `Connection: keep-alive`.
- Al conectar envía el comentario `: ok`. Cada 15 s envía `: ping` para mantener viva la conexión.
- Cada mensaje llega como un evento sin nombre: `data: <Envelope en JSON, una sola línea>`.
- El cliente usa `EventSource`. Cuando se dispara `onopen`, el cliente considera activo el servidor y publica `WHO`. La caja publica además un `SNAPSHOT`.

### `POST /__sync`: publicar

- El cuerpo es el `Envelope` en JSON, con `Content-Type: application/json`.
- El servidor quita los saltos de línea del cuerpo, lo reenvía a todos los clientes conectados y responde `204` sin cuerpo.
- El cliente solo publica cuando el `EventSource` está abierto. Usa `keepalive` si el cuerpo mide menos de 60 000 caracteres.

### CORS

- `OPTIONS /__sync` responde `204` (preflight).
- Si el `Origin` de la petición está en `ALLOWED_ORIGINS` (o, cuando esa variable no está definida, es una IP de red local: `10.x`, `172.16–31.x`, `192.168.x`), el servidor añade `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Methods: GET, POST, OPTIONS` y `Access-Control-Allow-Headers: Content-Type`.
- Orígenes permitidos por defecto: `http://localhost:5173` (web en desarrollo), `http://localhost:5174` (mobile en el navegador), `http://localhost` (app Android en modo desarrollo, `androidScheme: http`), `https://localhost` (app Android en producción) y `capacitor://localhost` (iOS).

### URL del servidor

| Proyecto | Valor |
|---|---|
| tendero-web | `VITE_SYNC_URL` o, si falta, `/__sync` en el mismo origen (Vite lo reenvía al servidor en desarrollo; en producción lo sirve el mismo servidor que sirve la web) |
| tendero-mobile | La que llega en el QR de vinculación o se escribe a mano, guardada en `tendero.servidor`. `VITE_SYNC_URL` (opcional) es solo el valor inicial. |

### `GET /__sync/info`: direcciones del servidor

Responde JSON sin abrir conexión SSE. La caja lo usa para saber qué dirección poner en el QR:

```json
{ "app": "abarre-sync", "port": 8787, "clients": 2,
  "urls": [{ "url": "http://192.168.1.20:8787/__sync", "name": "Wi-Fi", "virtual": false }] }
```

`urls` lista las IPv4 de la red local (las de adaptadores virtuales van al final). Si el servidor tiene `PUBLIC_SYNC_URL`, esa va primero.

### Entre pestañas del mismo navegador

Los clientes también publican cada `Envelope` en `BroadcastChannel('tendero')`. Así se comunican las pestañas del mismo origen aunque no haya servidor. Como un mismo `Envelope` puede llegar por los dos caminos, el cliente recuerda los últimos 800 `id` y descarta los repetidos.

## Envelope

```ts
interface Envelope {
  id: string;   // único por mensaje (uid())
  from: string; // único por instancia de la app, se genera al abrir la conexión
  msg: Message;
}
```

`uid()` = `Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)`.

## Mensajes (`msg`)

### Control

| `type` | Campos | Quién lo envía | Qué hace quien lo recibe |
|---|---|---|---|
| `WHO` | — | Todos, al abrir la conexión y cuando se abre el `EventSource` | Responde con `PING` si tiene clave de presencia y está en línea. La caja responde además con un `SNAPSHOT`. |
| `PING` | `key: string` | Todos, cada 4 s mientras están en línea | Marca `key` como presente. Una clave sin `PING` durante 10 s deja de estar presente. |
| `BYE` | `key: string` | Todos, al perder la conexión, al cerrar o en `pagehide` | Quita `key` de los presentes. La caja actualiza `lastSeen` del dispositivo. |
| `SNAPSHOT` | `data: Data` | Solo la caja | El celular reemplaza todos sus datos si `data.version === 5`. La caja lo ignora. |

Claves de presencia: la caja usa `'panel'` y cada celular vinculado usa el `id` de su `Device`. Un celular sin vincular no publica `PING`.

### Cambios de datos (acciones del reducer)

Cada cliente aplica estas acciones con el mismo reducer (`reducer` en `AppContext.tsx`). Los dos proyectos deben aplicarlas todas, aunque solo uno las genere, para que sus copias de los datos sigan iguales.

| `type` | Campos | Origen |
|---|---|---|
| `SCAN_TO_REGISTER` | `product: Product, qty: number, sentId: string, at: number, deviceId: string` | celular |
| `REMOVE_SENT` | `sentId: string` | celular |
| `TICKET_ADD` | `product: Product, qty: number, at: number` | caja |
| `TICKET_QTY` | `productId: string, delta: number` | caja |
| `TICKET_REMOVE` | `productId: string` | caja |
| `TICKET_CLEAR` | — | caja |
| `CONFIRM_SALE` | `sale: Sale` | caja |
| `MARK_SALE_SYNCED` | `saleId: string` | caja |
| `UPSERT_PRODUCT` | `product: Product, isNew: boolean, at: number` | caja y celular |
| `ADD_STOCK` | `entries: { productId: string; qty: number }[], at: number, note: string` | celular (`note: 'Entrada desde el celular'`) |
| `ADD_DEVICE` | `device: Device` | celular, al vincularse |
| `REMOVE_DEVICE` | `id: string` | caja (quitar dispositivo) y celular (desvincular) |
| `DEVICE_SEEN` | `id: string, at: number` | caja |
| `SET_PAIRING` | `pairing: { code: string; expiresAt: number } \| null` | caja (nuevo código) y celular (lo borra al vincularse) |
| `CLOSE_CUT` | `cut: CashCut` | caja |
| `OPEN_SHIFT` | `shift: Shift` | caja |
| `ADD_CASH_MOVEMENT` | `movement: CashMovement` | caja |
| `UPDATE_STORE` | `store: Store` | caja |
| `UPDATE_TICKET_CONFIG` | `config: TicketConfig` | caja |
| `UPSERT_USER` | `user: User, prevEmail?: string` | caja |
| `ACCOUNT_NEW` | `id: string, at: number` | caja: deja la cuenta activa en espera (o la descarta si está vacía y sin cliente) y abre una nueva llamada `Cuenta N` |
| `ACCOUNT_SWITCH` | `id: string` | caja: la cuenta activa pasa a espera y la cuenta `id` se vuelve la activa |
| `ACCOUNT_UPDATE` | `id: string, name: string, customerId: string \| null` | caja: nombre y cliente de una cuenta abierta |
| `UPSERT_CUSTOMER` | `customer: Customer` | caja. El reducer conserva el `balance` que ya tenía el cliente (0 si es nuevo) |
| `CREDIT_PAYMENT` | `movement: CreditMovement` (`type: 'abono'`) | caja: abono de un cliente, resta `amount` a su `balance` |
| `REPLACE_DATA` | `data: Data` | no se publica: el celular la aplica localmente al recibir un `SNAPSHOT` |
| `ORDER_RECEIVED` | `request: OrderRequest` (`{ id, customer: { name, phone }, items: { productId, qty }[], note?, at, pickupCode }`) | app de clientes (hoy simulado; ver abajo) |
| `ORDER_ADVANCE` | `id: string, from: OrderStatus, at: number` | caja |
| `ORDER_DELIVER` | `id: string, sale: Sale, payment: { method: CashMethod; received: number }, pickupCode: string` | caja, después de verificar el código del cliente |

`OrderRequest`, `PickupOrder`, `OrderStatus` y los textos de los estados están en `src/data/pickup.ts` (único lugar donde se definen).

Los tipos `Product`, `Sale`, `Device`, `CashCut`, `Shift`, `CashMovement`, `Customer`, `CreditMovement`, `Store`, `TicketConfig` y `User` están en `src/data/models.ts`.

#### Cuentas abiertas y crédito

- `ticket` son las líneas de la cuenta activa y `account` sus datos; las demás cuentas abiertas esperan en `parked`. `SCAN_TO_REGISTER`, `TICKET_*` y `CONFIRM_SALE` siempre actúan sobre la cuenta activa.
- `SCAN_TO_REGISTER` guarda en el envío `accountId = account.id`. `REMOVE_SENT` quita las piezas de la cuenta a la que llegaron, esté activa o en espera; `CONFIRM_SALE` y `TICKET_CLEAR` solo cambian el estado de los envíos de la cuenta activa (o sin `accountId`).
- Al cobrar (`CONFIRM_SALE`) o cancelar (`TICKET_CLEAR`) la cuenta activa queda vacía, con el mismo `id`, `customerId: null` y el siguiente nombre `Cuenta N` libre entre las cuentas en espera.
- Una venta con `method: 'credito'` y `customerId` crea en `CONFIRM_SALE` el `CreditMovement` `{ id: 'cr-' + sale.id, type: 'cargo', amount: sale.total, saleId }` y suma `sale.total` al `balance` del cliente. Si el cliente abona algo al momento, la caja publica después un `CREDIT_PAYMENT` con `saleId` y `sale.paid` es ese abono.

#### Pide y recoge (vista previa sin API)

Mientras no exista la API, los pedidos viven en `Data.orders`, igual que los productos, y llegan por este mismo canal.

- `ORDER_RECEIVED`: la caja ignora los precios que traiga la petición, toma los del catálogo y une las líneas repetidas. Si algún producto no existe, tiene `showInApp: false` o pide más que `stock − piezas apartadas` (pedidos `pendiente`, `preparando` o `listo`), el pedido no se acepta. Si se acepta, entra como `pendiente` con el siguiente folio `P-0001`. Un `id` repetido se ignora.
- `ORDER_ADVANCE` solo aplica si el pedido sigue en `from` y lo mueve una etapa (`pendiente → preparando → listo`). Para llegar a `entregado` se usa `ORDER_DELIVER`.
- `pickupCode` son 6 dígitos que genera el teléfono del cliente al confirmar el pedido; sin él, el pedido no se acepta. La caja lo guarda pero nunca lo muestra. El teléfono lo enseña como QR (`abarre:recoger:<id>:<código>`) cuando el pedido está listo.
- `ORDER_DELIVER` solo aplica a un pedido `listo` y cuyo `pickupCode` coincida con el del mensaje. Aplica `CONFIRM_SALE` con `sale.id = 'pedido-' + id`, `origin: 'pedido'`, `orderId` y `orderFolio`. Así descuenta existencia y entra en Ventas y en el corte. Después marca el pedido como `entregado`, con `payment`, `deliveredAt` y `saleId`.
- `CONFIRM_SALE` con `sale.orderId` es idempotente: si ya hay una venta con ese `id` u `orderId`, no hace nada. Además no toca la cuenta abierta (`ticket`, `account`, `sent`, `lastSaleId`).
- `Product.showInApp` (sin valor = `true`), `Sale.origin` (sin valor = `'tienda'`), `CashCut.storeSales` y `CashCut.pickupSales` son opcionales. Los datos anteriores siguen siendo válidos y `VERSION` no cambió. La caja agrega `orders` a los datos guardados que no lo traen.

### `Data` (versión 5)

```ts
interface Data {
  version: 5;
  store: Store;
  ticketConfig: TicketConfig;
  users: User[];
  products: Product[];
  movements: Movement[];
  ticket: TicketLine[]; // { product: Product; qty: number; source: 'movil' | 'manual'; flashAt: number }
  account: { id: string; name: string; customerId: string | null; openedAt: number };
  parked: { id: string; name: string; customerId: string | null; openedAt: number; lines: TicketLine[] }[];
  customers: Customer[];
  creditMovements: CreditMovement[];
  sales: Sale[];
  sent: { id: string; product: Product; qty: number; at: number; status: 'en-caja' | 'cobrado' | 'cancelado'; deviceId: string; accountId?: string }[];
  lastScan: { name: string; deviceId: string; at: number } | null;
  cuts: CashCut[];
  cashMovements: CashMovement[];
  shift: Shift;
  devices: Device[];
  pairing: { code: string; expiresAt: number } | null;
  closedCutId: string | null;
  lastSaleId: string | null;
  orders?: PickupOrder[]; // Pide y recoge; el celular puede no tenerlo
}
```

Si cambias la forma de `Data`, sube `VERSION` en los dos proyectos. Un cliente descarta los `SNAPSHOT` y los datos guardados de otra versión.

## Vinculación

1. La caja publica `SET_PAIRING` con un código de 6 dígitos que vence en 5 minutos. El QR contiene el código y la dirección del servidor (`src/lib/link.ts`, igual en los dos proyectos):

   ```
   abarre://vincular?codigo=123456&servidor=http%3A%2F%2F192.168.1.20%3A8787%2F__sync
   ```

   El celular también acepta los formatos anteriores, solo con el código: `ABARRE-LINK:<código>` y `TENDERO-LINK:<código>`. Una dirección escrita a mano (`192.168.1.20`, `192.168.1.20:8787`, `https://dominio.com`) se completa con el puerto `8787` y la ruta `/__sync`.
2. El celular abre la conexión con esa dirección, publica `WHO` y espera un `SNAPSHOT` nuevo de la caja (hasta 10 s; si no llega, avisa «La caja no respondió»). Con los datos recién recibidos busca el código. Si coincide y no ha vencido, publica `ADD_DEVICE` con su nuevo `Device` y después `SET_PAIRING` con `pairing: null`.
3. Desde ese momento el celular publica `PING` con `key = device.id`.

## Cambios sin conexión

Sin conexión (`navigator.onLine === false`), cada cliente guarda sus cambios en una cola y los publica como acciones normales al volver la conexión. La cola no viaja por la red.

```ts
type Op =
  | { id: string; kind: 'envio'; product: Product; qty: number; at: number }          // celular → SCAN_TO_REGISTER (sentId = id)
  | { id: string; kind: 'producto'; product: Product; isNew: boolean; at: number }    // ambos → UPSERT_PRODUCT
  | { id: string; kind: 'stock'; entries: { productId: string; qty: number }[]; at: number } // celular → ADD_STOCK
  | { id: string; kind: 'venta'; saleId: string; at: number };                         // caja → MARK_SALE_SYNCED
```

## Almacenamiento local

Todos los valores se guardan como JSON.

| Clave | Proyecto | Contenido |
|---|---|---|
| `tendero.datos` | ambos | `Data` (versión 5) |
| `tendero.pendientes.panel` | web | Cola `Op[]` de la caja |
| `tendero.pendientes.movil` | mobile | Cola `Op[]` del celular. En la app nativa se guarda en `@capacitor/preferences` con la misma clave y el mismo formato. |
| `tendero.sesion` | web | Correo del usuario con sesión abierta |
| `tendero.ultimoCorreo` | web | Último correo usado para entrar (texto plano, prellena el inicio de sesión) |
| `tendero.dispositivo` | mobile | `id` del `Device` vinculado en este celular |
| `tendero.servidor` | mobile | URL del servidor de sincronización elegida al vincular (`http://IP:8787/__sync`) |
| `abarre.tema` | ambos | `'sistema' \| 'claro' \| 'oscuro'` (texto plano, sin JSON) |
