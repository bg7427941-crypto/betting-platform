# Betting Platform — Backend (base)

Backend inicial (modo demo, saldo virtual) para una plataforma de apuestas
deportivas + casino. Incluye: autenticación (con validación de edad 18+),
billetera con transacciones atómicas, y esquema de base de datos completo
para sports betting y casino.

## Requisitos
- Node.js 18+
- PostgreSQL 14+

## Setup

```bash
npm install
cp .env.example .env
# edita .env con tus credenciales de PostgreSQL y un JWT_SECRET propio

npm run migrate   # crea las tablas
npm run dev        # levanta el servidor en modo desarrollo
```

## Endpoints disponibles

### Auth
- `POST /api/auth/register` — `{ email, password, fullName, birthDate }`
- `POST /api/auth/login` — `{ email, password }`

### Wallet (requieren header `Authorization: Bearer <token>`)
- `GET  /api/wallet` — saldo actual
- `POST /api/wallet/deposit` — `{ amount_cents }` (simulado, dinero ficticio)
- `POST /api/wallet/withdraw` — `{ amount_cents }`
- `GET  /api/wallet/history` — historial de transacciones

### Sports (requieren header `Authorization: Bearer <token>`)
- `GET  /api/sports/events` — eventos próximos/en vivo
- `GET  /api/sports/events/:id` — evento con sus cuotas
- `POST /api/sports/bets` — `{ eventId, oddsId, stake_cents }` (coloca apuesta, descuenta saldo)
- `POST /api/sports/admin/events` — `{ sport, homeTeam, awayTeam, startsAt }` (crear evento)
- `POST /api/sports/admin/events/:id/odds` — `{ market, selection, price }` (agregar cuota)
- `POST /api/sports/admin/events/:id/finish` — `{ result }` (marca resultado y liquida todas las apuestas automáticamente)

⚠️ Las rutas `/admin/*` ahora requieren rol `admin` (ver sección "Roles de administrador" abajo).

### Casino (requieren header `Authorization: Bearer <token>`)
- `POST /api/casino/play` — `{ game: 'roulette'|'slots', ... }`
  - Ruleta: `{ game: 'roulette', bets: [{ type, value?, stake_cents }, ...] }`
    (un array — se puede apostar a varias combinaciones en un mismo giro;
    `type` es `'straight'|'red'|'black'|'even'|'odd'|'low'|'high'|'dozen'|'column'`,
    `value` solo aplica a `straight` (0-36), `dozen` (1-3) y `column` (1-3))
  - Slots: `{ game: 'slots', stake_cents }` — gira 3 rodillos automáticamente
- `GET  /api/casino/history` — historial de rondas jugadas

## Roles de administrador

Todo usuario nuevo se crea con `role = 'user'`. Para promover al primer
admin (y cualquier siguiente), corre esto **manualmente** desde tu máquina,
no hay endpoint HTTP para esto a propósito:

```bash
npm run promote-admin -- correo@ejemplo.com
```

Nota: el rol viaja dentro del JWT. Si le quitas el rol admin a alguien,
su token existente lo seguirá teniendo hasta que expire — para revocación
inmediata necesitarías una lista de tokens invalidados o bajar el
`JWT_EXPIRES_IN`.

## Frontend (React + Vite)

Está en `/frontend`. Consume la API del backend, con las páginas:
- **Login / Registro** — con validación de mayoría de edad.
- **Deportes** — lista de eventos, cuotas expandibles, boleta de apuesta.
- **Casino** — ruleta (rojo/negro, par/impar, alto/bajo) y tragamonedas.
- **Billetera** — saldo, depósito/retiro simulado, historial.

Diseño: paleta "tapete de casino" (verde fieltro + dorado), tipografía
Fraunces para títulos e IBM Plex Sans/Mono para interfaz y números.

```bash
cd frontend
npm install
cp .env.example .env   # apunta VITE_API_URL al backend
npm run dev             # http://localhost:5173
```

## Qué falta (siguientes pasos)

1. **Carga de eventos/cuotas real**: integrar una API externa (ej. The Odds
   API) en vez de cargarlos a mano.
2. **Límites de juego responsable**: límites de depósito/apuesta configurables
   por usuario, auto-exclusión, alertas de tiempo jugado — buena práctica y
   además exigido por la mayoría de reguladores de juego.
3. **Antes de manejar dinero real**: licencia de MINCETUR (Perú), integración
   con pasarela de pagos certificada, KYC real, auditoría del RNG por un
   laboratorio certificado (obligatorio para casino real, no solo buena
   práctica).

## Notas de seguridad importantes
- Los montos se manejan en **centavos** (enteros) para evitar errores de
  redondeo con floats.
- Todo movimiento de saldo pasa por una transacción SQL con `FOR UPDATE`
  para evitar condiciones de carrera (ej. dos apuestas simultáneas
  descontando el mismo saldo).
- El RNG del casino debe ser criptográficamente seguro — no uses `Math.random()`.
