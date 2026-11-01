# Pin&Pon 3D — Cotizador

Sistema interno de Pin&Pon 3D (impresión 3D a pedido, Costa Rica): cotizador, trabajos, inventario, feria, finanzas y tienda en línea. HTML/CSS/JS sin build, con Firebase (Auth + Firestore) y publicado en Firebase Hosting.

## Páginas

| Archivo | Para quién | Qué hace |
|---|---|---|
| `index.html` | Equipo (login) | App completa: cotizador, trabajos, calendario, inventario, feria, costos, catálogo, clientes, configuración y usuarios |
| `feria.html` | Puesto de feria (sin login, sesión anónima) | Marcar ventas del día con el pulgar y cerrar el día |
| `tienda.html` | Público | Catálogo con carrito; el pedido se envía por WhatsApp y queda registrado en *Pedidos online* |

## Código

- `css/styles.css` — sistema visual (tokens, componentes, modo oscuro). Superficies planas, tarjetas de 28px, botones píldora, sin sombras; colores de la marca.
- `js/db.js` — Firebase y todo el acceso a Firestore (incluye el cierre de día de feria en una transacción).
- `js/logic.js` — cálculo de la cotización.
- `js/ui.js` — render de tablas, tarjetas, gráficos, toasts, tema.
- `js/auth.js` — sesión y roles (`admin`, `usuario`, `feria`).
- `js/app.js` — controlador: navegación, CRUD, PDFs, Excel, paleta de búsqueda (Ctrl/⌘ + K).
- `firestore.rules` — reglas de seguridad propuestas (ver abajo).
- `apps-script/` — backend viejo de Google Sheets; ya no se usa.

## Reglas de Firestore

`firestore.rules` **no** está enlazado en `firebase.json` a propósito, para que publicar la página no cambie las reglas sin querer. Para activarlas:

1. Probarlas en Firebase Console → Firestore → Reglas → *Rules Playground* (o con el emulador): login de admin, usuario, feria anónima y la tienda sin sesión.
2. Crear el documento `/usuarios/{uid}` de cualquier cuenta que todavía no lo tenga (sin perfil ya no hay acceso).
3. Agregar `"firestore": { "rules": "firestore.rules" }` a `firebase.json`.
4. `firebase deploy --only firestore:rules`

## Publicar

```bash
firebase deploy --only hosting
```
