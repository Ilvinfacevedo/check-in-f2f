# Check-in semanal · Protocolo F2F — Guía de configuración

App web estática (HTML + CSS + JS, sin instalar nada). Tus asesorados la abren desde el celular, la llenan en menos de 1 minuto y:

1. Se guarda una fila en tu Google Sheet (hoja **Checkins**).
2. Al final les sale un botón para mandarte el resumen por WhatsApp.

```
check-in-f2f/
├── index.html          ← la app
├── styles.css
├── app.js
├── config.js           ← ÚNICO archivo que tienes que editar
├── og-image.png        ← imagen que sale al compartir el enlace
├── favicon.svg / apple-touch-icon.png
└── apps-script/Code.gs ← código para Google Sheets
```

---

## 1. Conectar Google Sheets (10 minutos)

1. Entra a [sheets.new](https://sheets.new) y ponle nombre a la hoja, por ejemplo **F2F · Check-ins**.
2. Arriba, ve a **Extensiones → Apps Script**.
3. Borra todo lo que aparece en `Código.gs` y **pega completo** el contenido de `apps-script/Code.gs`. Dale a 💾 Guardar.
4. En la barra de arriba elige la función **`setup`** y dale a **▶ Ejecutar**.
   - Google te pedirá permisos: **Revisar permisos → tu cuenta → Configuración avanzada → Ir a (proyecto) → Permitir**. Es normal: el script es tuyo.
   - Al terminar, en tu hoja aparecerá la pestaña **Checkins** con los encabezados.
5. Arriba a la derecha: **Implementar → Nueva implementación**.
   - Tipo (⚙️): **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario** (sin esto la app no puede guardar).
   - **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
6. Abre `config.js` y pega la URL:

   ```js
   SCRIPT_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```

7. Prueba: abre la URL `/exec` en tu navegador. Debe decir `{"ok":true,...}`.

> **Si cambias el código de `Code.gs` más adelante:** Implementar → Gestionar implementaciones → ✏️ → Versión: *Nueva versión* → Implementar. Así la URL sigue siendo la misma.

**Columnas que se guardan:** Fecha · Semana · Año · Nombre · Dieta · Entreno · Sesiones · Sueño (h/noche) · Calidad sueño · Digestión · Digestión (nota) · Energía · Peso (lb) · Notas · F2F Score · ID.

**¿Y si falla el internet del cliente?** La app no se rompe: guarda el check-in en el teléfono y lo vuelve a intentar sola cada vez que la abre o recupera la conexión. El ID evita filas repetidas.

---

## 2. Probar en tu computadora

Necesitas un servidor local (abrir el archivo con doble clic no sirve para todo). Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

Abre <http://localhost:8000/?c=Juan>. Para verla como celular: Chrome → clic derecho → **Inspeccionar** → icono de 📱 (Ctrl+Shift+M) → elige un iPhone o Pixel.

Para empezar de cero: en la consola del navegador escribe `localStorage.clear()` y recarga.

---

## 3. Publicar en GitHub Pages

Este repositorio ya trae un workflow (`.github/workflows/pages.yml`) que publica la app.

1. En GitHub, entra al repo **check-in-f2f → Settings → Pages**.
2. En **Build and deployment → Source** elige **GitHub Actions**.
3. Ve a la pestaña **Actions**, abre *Check-in semanal → GitHub Pages* y dale a **Run workflow** (solo la primera vez).
4. En 1–2 minutos queda en:

   **https://ilvinfacevedo.github.io/check-in-f2f/**

Cada vez que se suba un cambio a `main`, se vuelve a publicar solo.

> Si un día lo mueves a otro dominio, cambia en `index.html` las dos URLs de `og:url` y `og:image` para que la vista previa en WhatsApp siga saliendo.

---

## 4. Enlace personal de cada cliente

Agrega `?c=` y el nombre al final del enlace. Los espacios se escriben como `%20` (o `+`):

| Cliente        | Enlace                                                        |
|----------------|---------------------------------------------------------------|
| Juan           | `https://ilvinfacevedo.github.io/check-in-f2f/?c=Juan`        |
| María Pérez    | `https://ilvinfacevedo.github.io/check-in-f2f/?c=María%20Pérez` |

Con el enlace personal, la bienvenida dice “Hola, Juan 👋” y no le pide el nombre. Sin `?c=`, la app le pregunta cómo se llama.

**Tip:** usa siempre el mismo nombre para cada cliente; así en la hoja puedes filtrar su evolución semana a semana.

---

## 5. ¿Cómo se calcula el F2F Score? (0–100)

| Parte    | Peso | Cómo se mide                                                     |
|----------|------|------------------------------------------------------------------|
| Dieta    | 35 % | valor 1–10 × 10                                                  |
| Entreno  | 30 % | valor 1–10 × 10                                                  |
| Sueño    | 20 % | 60 % horas (7–9 h = 100; baja fuera de ese rango) + 40 % calidad (Mala 40 · Normal 75 · Buena 100) |
| Energía  | 15 % | valor 1–5 × 20                                                   |

Para cambiar los pesos, edita `computeScore` en `app.js`.

---

## 6. Cambiar el WhatsApp del coach

En `config.js`, `COACH_PHONE` (código de país + número, sin `+` ni espacios). Hoy: `18294493723`.
