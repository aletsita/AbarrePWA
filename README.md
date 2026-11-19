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

Los celulares de la misma red se conectan directamente al servidor: `http://IP-de-tu-PC:8787/__sync`. Si Windows pregunta por el firewall, permite el acceso de Node.js en redes privadas.

## Producción

```bash
npm run build          # genera dist/ con el service worker
npm run start:server   # sirve dist/ y /__sync en el mismo puerto
```

Basta un solo despliegue: el servidor sirve la web y la sincronización. Detrás de HTTPS (por ejemplo, un proxy inverso), la app del celular debe apuntar a `https://tu-dominio/__sync`.

`npm run preview` también funciona: sirve `dist/` en http://localhost:4173 y reenvía `/__sync` al servidor, que debe estar corriendo.

### Variables de entorno

| Variable | Dónde | Por defecto | Uso |
|---|---|---|---|
| `PORT` | servidor | `8787` | Puerto del servidor |
| `HOST` | servidor | `0.0.0.0` | Interfaz donde escucha |
| `ALLOWED_ORIGINS` | servidor | `http://localhost:5173,http://localhost:5174,http://localhost,https://localhost,capacitor://localhost` | Orígenes con CORS permitido, separados por comas. `*` permite cualquiera. |
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
| `/panel/corte` | Corte del día, movimientos de efectivo, Excel y PDF |
| `/panel/dispositivos` | Celulares vinculados y vinculación con QR |
| `/panel/configuracion` | Datos de la tienda, usuarios y roles, ticket |

## Uso

### Entrar a la caja

El acceso viene prellenado: `donpepe@correo.mx` (Dueño) con contraseña `abarre`; solo toca **Entrar**. Funciona cualquier contraseña de 4 caracteres o más, y un correo nuevo entra como Dueño. También existe `ana.lopez@correo.mx` (Cajero).

### Atajos

- `F2` lleva al buscador y `F12` abre el cobro.
- En el cobro, `1`, `2` y `3` eligen efectivo, tarjeta o transferencia, y `Ctrl+Enter` confirma.
- **Más vendidos**, debajo del buscador, agrega con un toque los productos que más salen.

### Vincular un celular

1. Abre **Dispositivos → Vincular nuevo celular**. Aparecen un QR y un código de 6 dígitos que vence en 5 minutos.
2. En la app del celular, escanea el QR o escribe el código.
3. La caja detecta el celular al instante y lo muestra como **Conectado**.

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
