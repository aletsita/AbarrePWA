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
npm run dev:server   # servidor de sincronización en http://0.0.0.0:8787
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
