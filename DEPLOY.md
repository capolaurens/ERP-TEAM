# Guía de despliegue — ERP Navyx

Dos partes: **(A)** conectar Google Drive y **(B)** subirlo a Railway.

---

## A) Conectar Google Drive (cuenta de servicio)

La app sube los archivos a tus carpetas de Drive usando una *cuenta de servicio*
(una "cuenta robot" de Google). Se configura una sola vez.

1. **Google Cloud Console** → https://console.cloud.google.com → crea o elige un proyecto.
2. **Habilita la Google Drive API**: *APIs y servicios → Biblioteca → "Google Drive API" → Habilitar*.
3. **Crea la cuenta de servicio**: *IAM y administración → Cuentas de servicio → Crear cuenta de servicio*.
   - Nombre: `erp-navyx-drive`. No necesita ningún rol. Pulsa *Listo*.
4. **Crea su clave JSON**: entra en la cuenta creada → pestaña **Claves** → *Agregar clave → Crear clave nueva → JSON*. Se descarga un archivo `.json`.
5. **Copia el email** de la cuenta de servicio (algo como `erp-navyx-drive@tu-proyecto.iam.gserviceaccount.com`).
6. **Comparte las carpetas**: en Google Drive, en cada carpeta de equipo (Marketing, Ventas, Diseño) → *Compartir* → añade ese email con permiso **Editor**.
   - Si usáis **Unidades compartidas**, añade la cuenta de servicio como *miembro* de la unidad.
7. **Copia el ID de cada carpeta**: está en la URL al abrirla → `drive.google.com/drive/folders/`**`ESTE_ES_EL_ID`**.
8. **Convierte el JSON a base64** (recomendado para variables de entorno):
   ```bash
   base64 -i cuenta-de-servicio.json | tr -d '\n'
   ```
   Pega el resultado en la variable `GOOGLE_SERVICE_ACCOUNT_JSON`. *(También puedes pegar el JSON tal cual.)*
9. En el ERP, entra como **administrador → Ajustes** y pega el **ID de carpeta** de cada equipo (o usa las variables `DRIVE_FOLDER_MARKETING/SALES/DESIGN`). Esa pantalla también te muestra el email con el que compartir las carpetas.

---

## B) Subir a Railway (online)

1. **Sube el código a GitHub** (si aún no lo está):
   ```bash
   cd "ERP NAVYX TEAM"
   git init && git add -A && git commit -m "ERP Navyx"
   gh repo create erp-navyx --private --source=. --push   # o crea el repo a mano y haz push
   ```
2. **Railway** → https://railway.app → *New Project → Deploy from GitHub repo* → elige el repo.
   Railway detecta el `Dockerfile` automáticamente.
3. **Añade PostgreSQL**: dentro del proyecto, *New → Database → PostgreSQL*. Crea la variable `DATABASE_URL`.
4. **Variables del servicio de la app** (pestaña *Variables*):
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | referencia a `${{Postgres.DATABASE_URL}}` |
   | `AUTH_SECRET` | resultado de `openssl rand -base64 32` |
   | `AUTH_URL` | `https://<tu-app>.up.railway.app` (tras generar el dominio) |
   | `AUTH_TRUST_HOST` | `true` |
   | `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | datos del primer admin |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | (paso A) |
   | `DRIVE_FOLDER_MARKETING` / `_SALES` / `_DESIGN` | (opcional) |
   | `GOOGLE_CALENDAR_ID` | (opcional) ID del calendario de empresa para sincronizar vencimientos |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | (opcional) avisos por email |
5. **Genera el dominio**: *Settings → Networking → Generate Domain*. Copia la URL a `AUTH_URL` y vuelve a desplegar.
6. Al desplegar, el contenedor ejecuta **`prisma migrate deploy`** solo (crea las tablas).
7. **Crea el primer admin**. Desde tu máquina, con el repo y la CLI de Railway:
   ```bash
   npm i -g @railway/cli
   railway link        # elige el proyecto
   railway run npm run db:seed
   ```
   Usará las variables de Railway (incluida `DATABASE_URL`) y creará el admin con `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
8. Entra en la URL de Railway con ese admin, cambia la contraseña y crea las cuentas del equipo.

> **Nota:** los archivos no se guardan en Railway (su disco es efímero): van a Google Drive. La base de datos sí es persistente en el servicio de Postgres de Railway.
