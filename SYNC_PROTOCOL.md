# Protocolo de sincronización caja ↔ celular

Contrato entre **tendero-web** (la caja y el servidor) y **tendero-mobile** (la app del celular). Los dos proyectos tienen su propia copia del código que lo implementa (`src/lib/sync.ts` y `src/context/AppContext.tsx`). Si cambias algo de este documento, cámbialo en los dos proyectos y en las dos copias de este archivo.

- **Versión del formato de datos:** `4` (constante `VERSION` en `AppContext.tsx`)
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
- Si el `Origin` de la petición está en `ALLOWED_ORIGINS`, el servidor añade `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Methods: GET, POST, OPTIONS` y `Access-Control-Allow-Headers: Content-Type`.
- Orígenes permitidos por defecto: `http://localhost:5173` (web en desarrollo), `http://localhost:5174` (mobile en el navegador), `http://localhost` (app Android en modo desarrollo, `androidScheme: http`), `https://localhost` (app Android en producción) y `capacitor://localhost` (iOS).

### URL del servidor

| Proyecto | Valor |
|---|---|
| tendero-web | `VITE_SYNC_URL` o, si falta, `/__sync` en el mismo origen (Vite lo reenvía al servidor en desarrollo; en producción lo sirve el mismo servidor que sirve la web) |
| tendero-mobile | `VITE_SYNC_URL` obligatoria y absoluta, por ejemplo `http://192.168.1.20:8787/__sync` |

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
| `SNAPSHOT` | `data: Data` | Solo la caja | El celular reemplaza todos sus datos si `data.version === 4`. La caja lo ignora. |

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
| `REPLACE_DATA` | `data: Data` | no se publica: el celular la aplica localmente al recibir un `SNAPSHOT` |

Los tipos `Product`, `Sale`, `Device`, `CashCut`, `Shift`, `CashMovement`, `Store`, `TicketConfig` y `User` están en `src/data/models.ts`.

### `Data` (versión 4)

```ts
interface Data {
  version: 4;
  store: Store;
  ticketConfig: TicketConfig;
  users: User[];
  products: Product[];
  movements: Movement[];
  ticket: { product: Product; qty: number; source: 'movil' | 'manual'; flashAt: number }[];
  sales: Sale[];
  sent: { id: string; product: Product; qty: number; at: number; status: 'en-caja' | 'cobrado' | 'cancelado'; deviceId: string }[];
  lastScan: { name: string; deviceId: string; at: number } | null;
  cuts: CashCut[];
  cashMovements: CashMovement[];
  shift: Shift;
  devices: Device[];
  pairing: { code: string; expiresAt: number } | null;
  closedCutId: string | null;
  lastSaleId: string | null;
}
```

Si cambias la forma de `Data`, sube `VERSION` en los dos proyectos. Un cliente descarta los `SNAPSHOT` y los datos guardados de otra versión.

## Vinculación

1. La caja publica `SET_PAIRING` con un código de 6 dígitos que vence en 5 minutos. El QR contiene `ABARRE-LINK:<código>`; el celular también acepta `TENDERO-LINK:<código>`.
2. El celular busca el código en su copia de los datos, que recibió en el `SNAPSHOT`. Si coincide y no ha vencido, publica `ADD_DEVICE` con su nuevo `Device` y después `SET_PAIRING` con `pairing: null`.
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
| `tendero.datos` | ambos | `Data` (versión 4) |
| `tendero.pendientes.panel` | web | Cola `Op[]` de la caja |
| `tendero.pendientes.movil` | mobile | Cola `Op[]` del celular. En la app nativa se guarda en `@capacitor/preferences` con la misma clave y el mismo formato. |
| `tendero.sesion` | web | Correo del usuario con sesión abierta |
| `tendero.ultimoCorreo` | web | Último correo usado para entrar (texto plano, prellena el inicio de sesión) |
| `tendero.dispositivo` | mobile | `id` del `Device` vinculado en este celular |
| `abarre.tema` | ambos | `'sistema' \| 'claro' \| 'oscuro'` (texto plano, sin JSON) |
