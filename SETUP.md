# Check-in semanal · Protocolo F2F — Guía

Tres piezas:

| Pieza | Dirección | Para quién |
|---|---|---|
| **App de check-in** | https://ilvinfacevedo.github.io/check-in-f2f/?c=Nombre | Tus asesorados |
| **Panel del coach** | https://ilvinfacevedo.github.io/check-in-f2f/coach.html | Solo tú (con clave) |
| **Hoja de Google** | **Protocolo F2F · Check-ins** (en tu Google Drive) | Solo tú |

```
check-in-f2f/
├── index.html · styles.css · app.js    ← app de check-in
├── coach.html · coach.css · coach.js   ← panel del coach
├── config.js                           ← URL del Apps Script y tu WhatsApp
├── apps-script/Code.gs                 ← código de la hoja
└── og-image.png · favicon.svg · apple-touch-icon.png
```

---

## 1. Instalar la hoja (una sola vez, desde una computadora)

> Hazlo en una **ventana de incógnito** con **solo** tu cuenta acevedoilvinf@gmail.com abierta. Si hay varias cuentas abiertas, Apps Script se confunde.

1. Abre la hoja **Protocolo F2F · Check-ins**. Ya viene con sus 4 pestañas y el diseño: **📊 Panel · 👥 Clientes · 📋 Checkins · ⚙️ Configuración**.
   (Si algún día empiezas con una hoja vacía, después del paso 3 ejecuta la función **`setup`** con ▶ y crea todo esto sola.)
2. Menú **Extensiones → Apps Script**.
3. Borra todo lo que hay en `Código.gs`, pega **completo** el archivo `apps-script/Code.gs` y dale a 💾 Guardar.
4. En Apps Script: **Implementar → Nueva implementación → ⚙️ Aplicación web**.
   - Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier usuario**.
   - **Implementar**. Google te pide permisos: **Revisar permisos → tu cuenta → Configuración avanzada → Ir a… → Permitir**.
   - Copia la URL que termina en `/exec`.
5. Pon esa URL en `config.js` (`SCRIPT_URL`). Si me la mandas, lo hago yo.

**Si más adelante actualizas `Code.gs`:** pega el nuevo código → Guardar → ejecuta `setup` → **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. Así la URL no cambia.

---

## 2. Configurar (pestaña ⚙️ Configuración)

Solo se toca la columna B:

| Ajuste | Qué poner |
|---|---|
| **Clave del panel del coach** | Una clave tuya (mínimo 6 caracteres). Es la que pide `coach.html`. |
| **Correo para avisos** | Opcional. Vacío = tu Gmail. |
| **Aviso por correo en cada check-in** | ☑️ si quieres un correo cada vez que alguien envía. |
| **Recordatorio de los lunes** | Usa el menú **F2F → ⏰ Activar recordatorios**: cada lunes a las 9 a. m. te llega un correo con quién no ha enviado. |
| **Enlace de la app** | Ya viene puesto. Solo cámbialo si mueves la app. |

---

## 3. Tu día a día

**Cliente nuevo**
1. Escríbelo en **👥 Clientes**: nombre, WhatsApp (ej.: `18091234567`), estado *Activo*.
2. El **enlace personal** se crea solo.
3. Toca **📲 Enviar** en su fila: se abre WhatsApp con el mensaje y el enlace ya escritos.

**Cada semana**
- Los check-ins llegan a **📋 Checkins** (con colores: rojo = bajo, verde = alto).
- **📊 Panel** muestra a cada cliente: último check-in, si está **🟢 Al día / 🟡 Toca ya / 🔴 Atrasado**, score, promedio de 4 semanas, mini gráfica, dieta, entreno y cambio de peso.
- Para gráficas grandes por cliente: abre **coach.html** en tu celular o computadora y escribe tu clave.

**Cliente que pausa o termina:** cambia su estado a *Pausado* o *Terminado*. Deja de salir en el Panel, pero su historial se queda.

**Si la hoja se ve desordenada:** menú **F2F → 🎨 Reaplicar diseño**. No borra datos.

⚠️ No cambies el orden ni los nombres de las columnas de 📋 Checkins.

---

## 4. Panel del coach (`coach.html`)

- Dirección: **https://ilvinfacevedo.github.io/check-in-f2f/coach.html**
- Pide la clave de ⚙️ Configuración. Con "Recordarme" no la vuelve a pedir en ese dispositivo.
- **Vista general:** cuántos enviaron esta semana, score promedio, pendientes, y la lista con el estado de cada cliente.
- **Por cliente:** F2F Score, peso, dieta vs. entreno, sueño (con zona ideal 7–9 h), energía, cintura e historial completo con notas.
- Para verlo con datos de ejemplo: `coach.html?demo=1`.
- **Seguridad:** la clave se comprueba en tu Apps Script, no en la página. Sin la clave correcta no sale ningún dato.

---

## 5. La app de check-in

Preguntas: dieta (1–10), entreno (1–10, más sesiones), sueño (horas promedio y calidad), digestión, energía (1–5), peso y cintura (opcionales) y notas. Al final muestra el **F2F Score** y el botón para mandarte el resumen por WhatsApp.

- **Enlace personal:** `…/check-in-f2f/?c=Nombre` (lo genera 👥 Clientes).
- **Sin internet:** el check-in se guarda en el teléfono y se envía solo después.
- **Si cierra la app a mitad:** al volver sigue donde iba.

**F2F Score (0–100):** dieta 35 % + entreno 30 % + sueño 20 % (horas 60 % y calidad 40 %) + energía 15 %. Se cambia en `computeScore` de `app.js`.

---

## 6. Probar en tu computadora

```bash
python3 -m http.server 8000
```
Abre <http://localhost:8000/?c=Prueba> y <http://localhost:8000/coach.html?demo=1>.

## 7. Publicación

Cada cambio que se sube a `main` se publica solo en GitHub Pages (pestaña **Actions**).
