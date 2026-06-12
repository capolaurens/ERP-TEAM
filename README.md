# ERP Navyx

Intranet/ERP interno del equipo de Navyx: gestión de **tareas** (tablero Kanban + tabla),
**proyectos/áreas**, **calendario** de vencimientos y **dashboard**, con login propio y
**roles** (Admin, Marketing, Ventas, Diseño/3D). Los archivos que se suben en una tarea
van a las **carpetas de Google Drive** del equipo correspondiente.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** + componentes propios
- **PostgreSQL** + **Prisma 7** (`@prisma/adapter-pg`)
- **Auth.js v5** (credenciales, sesión JWT)
- **Google Drive** vía `@googleapis/drive` (cuenta de servicio)

## Desarrollo local

```bash
# 1. Base de datos (Postgres en Docker)
docker compose up -d

# 2. Dependencias
npm install

# 3. Variables de entorno
cp .env.example .env        # ya viene con valores para local

# 4. Migraciones + admin inicial
npm run db:migrate
npm run db:seed             # crea admin@navyx.com / Navyx2025! (configurable en .env)

# 5. Arrancar
npm run dev                 # http://localhost:3001  (o el puerto por defecto 3000)
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma generate` + build de producción |
| `npm run db:migrate` | Crea/aplica migraciones en local |
| `npm run db:deploy` | Aplica migraciones en producción |
| `npm run db:seed` | Crea el primer administrador |
| `npm run db:studio` | Prisma Studio (explorar la BD) |

## Despliegue

Ver **[DEPLOY.md](DEPLOY.md)** — guía paso a paso para Google Drive y Railway.

## Roles

- **Admin**: ve y gestiona todo, crea usuarios y configura Drive.
- **Marketing / Ventas / Diseño**: ven solo los proyectos, tareas y archivos de su equipo.
