# ERP Navyx — imagen de producción (Railway)
FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Dependencias (incluye devDependencies: hacen falta para compilar y para prisma)
COPY package.json package-lock.json ./
# El esquema de Prisma debe estar ANTES de `npm ci`: el postinstall ejecuta `prisma generate`.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# Código y compilación (prisma generate + next build)
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Aplica migraciones pendientes y arranca el servidor
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
