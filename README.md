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
- `GET  /api/sports/admin/events` — todos los eventos (cualquier estado), con conteo de cuotas y apuestas pendientes
- `POST /api/sports/admin/events` — `{ sport, startsAt, homeTeamId, awayTeamId }` o `{ sport, startsAt, homeTeam, awayTeam }` (crear evento; si le pasas los IDs de dos equipos registrados, el evento queda vinculado a ellos y se puede usar el endpoint de cuotas automáticas de abajo)
- `POST /api/sports/admin/events/:id/odds` — `{ market, selection, price }` (agregar cuota manual)
- `POST /api/sports/admin/events/:id/odds/auto` — `{ marginRate? }` (calcula y guarda cuotas automáticamente a partir de las estadísticas de los equipos vinculados — ver "Cálculo automático de cuotas" abajo; `marginRate` es opcional, 0-0.5, default 0.06)
- `POST /api/sports/admin/events/:id/finish` — `{ result }` (marca resultado y liquida todas las apuestas automáticamente, todo en una transacción)

⚠️ Las rutas `/admin/*` ahora requieren rol `admin` (ver sección "Roles de administrador" abajo).

### Admin (requieren rol `admin`)
- `GET /api/admin/summary` — resumen para el dashboard: usuarios activos,
  saldo total en circulación, apuestas pendientes (conteo + monto), eventos
  por estado, y resultado neto del casino del día.
- `GET /api/admin/teams?sport=futbol` — lista equipos (el filtro `sport` es opcional)
- `POST /api/admin/teams` — `{ name, sport, attackRating?, defenseRating?, eloRating?, notes? }` (crea un equipo)
- `PATCH /api/admin/teams/:id` — `{ attackRating?, defenseRating?, eloRating?, notes? }` (edita sus estadísticas)

### Casino (requieren header `Authorization: Bearer <token>`)
- `POST /api/casino/play` — `{ game: 'roulette'|'slots', ... }`
  - Ruleta: `{ game: 'roulette', bets: [{ type, value?, stake_cents }, ...] }`
    (un array — se puede apostar a varias combinaciones en un mismo giro;
    `type` es `'straight'|'red'|'black'|'even'|'odd'|'low'|'high'|'dozen'|'column'`,
    `value` solo aplica a `straight` (0-36), `dozen` (1-3) y `column` (1-3))
  - Slots: `{ game: 'slots', stake_cents }` — gira 3 rodillos automáticamente
- `GET  /api/casino/history` — historial de rondas jugadas

## Cálculo automático de cuotas

Cada equipo (`/api/admin/teams`) tiene estadísticas editables que alimentan
un motor de cálculo (`src/modules/teams/odds-engine.js`) con dos modelos,
elegidos según el deporte:

- **Fútbol** (con empate): modelo de **Maher (1982)** con la corrección de
  **Dixon & Coles (1997)** ["Modelling Association Football Scores and
  Inefficiencies in the Football Betting Market", *Applied Statistics*
  46(2)]. Cada equipo tiene una fuerza de **ataque** y **defensa**
  relativas al promedio de liga (1.0 = promedio). Los goles esperados de
  cada lado se modelan como Poisson, con una corrección τ_ρ (ρ = -0.13,
  el valor original fitteado por los autores) que sube la probabilidad de
  empates de gol bajo (0-0, 1-1), que el Poisson puro subestima.
- **Básquet / tenis / vóley** (sin empate): rating **Elo** genérico
  (Elo, 1978), con la fórmula logística estándar
  `P(local) = 1 / (1 + 10^(-((EloLocal + ventaja) - EloVisita)/400))`.

Las probabilidades se convierten a cuota decimal con el método
"overround multiplicativo" estándar de la industria: dado un margen de
casa `m`, `cuota = 1 / (probabilidad · (1 + m))`.

Un evento solo puede usar `/odds/auto` si se creó vinculado a dos equipos
registrados (`homeTeamId`/`awayTeamId` al crearlo). Recalcular cuotas
desactiva (no borra) las cuotas `1x2` anteriores del evento — las
apuestas ya hechas siguen referenciando su cuota original.

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
`JWT_EXPIRES_IN`. Después de promover a un usuario, tiene que cerrar
sesión y volver a entrar para que el nuevo token incluya el rol.

## Frontend (React + Vite)

Está en `/frontend`. Consume la API del backend, con las páginas:
- **Login / Registro** — con validación de mayoría de edad.
- **Deportes** — lista de eventos, cuotas expandibles, boleta de apuesta.
- **Casino** — ruleta (rojo/negro, par/impar, alto/bajo) y tragamonedas.
- **Billetera** — saldo, depósito/retiro simulado, historial.
- **Admin** (solo visible/accesible con rol `admin`) — dashboard con
  métricas (usuarios, saldo en circulación, apuestas pendientes, resultado
  neto del casino hoy); gestión de **equipos** (crear/editar sus
  estadísticas de ataque-defensa o Elo según el deporte); formulario para
  crear eventos (con selección de equipos registrados o texto libre); y
  por cada evento: **calcular cuotas automáticamente**, agregar cuotas
  manuales, y finalizar/liquidar con un resultado.

Diseño: paleta "tapete de casino" (verde fieltro + dorado), tipografía
Fraunces para títulos e IBM Plex Sans/Mono para interfaz y números.

```bash
cd frontend
npm install
cp .env.example .env   # apunta VITE_API_URL al backend
npm run dev             # http://localhost:5173
```

## Qué falta (siguientes pasos)

1. **Datos reales de equipos**: las estadísticas de ataque/defensa/Elo se
   cargan y editan a mano en el admin. El siguiente paso natural es
   alimentarlas desde resultados históricos reales (ajustando λ/μ por
   máxima verosimilitud, como hace el paper original de Dixon-Coles) o
   desde una API externa (ej. The Odds API) en vez de fijarlas manualmente.
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
