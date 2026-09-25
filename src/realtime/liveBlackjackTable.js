const { withTransaction } = require('../db');
const { createShoe, drawCard, handValue, isBlackjack, playDealer, settleBlackjackHand } = require('../modules/casino/games.engine');

// Tiempos de mesa (ms). Pensados para que se sienta una mesa real: hay una
// ventana de apuestas, cada jugador tiene su tiempo para decidir (si no
// actúa, se planta solo, como en cualquier mesa con crupier de verdad), y
// una pausa mostrando resultados antes de la siguiente ronda.
const BETTING_MS = 15000;
const TURN_MS = 20000;
const DEAL_PAUSE_MS = 1400;
const SETTLE_MS = 6000;

// El shoe se comparte entre todos los sentados y NO se reparte de nuevo en
// cada mano — se re-baraja recién cuando queda poco (menos de un mazo),
// como en una mesa real, y siempre entre manos, nunca a mitad de una.
const RESHUFFLE_AT = 52;

function freshSeatRound(seat) {
  seat.betCents = 0;
  seat.cards = [];
  seat.doubled = false;
  seat.done = false;
  seat.resultOutcome = null;
  seat.payoutCents = null;
}

async function getWallet(client, userId) {
  const result = await client.query(`SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
  const wallet = result.rows[0];
  if (!wallet) throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
  return wallet;
}

async function debitWallet(client, wallet, amountCents) {
  const newBalance = Number(wallet.balance_cents) - amountCents;
  await client.query(`UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`, [
    newBalance,
    wallet.id,
  ]);
  await client.query(
    `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type)
     VALUES ($1, 'bet_stake', $2, $3, 'live_table')`,
    [wallet.id, -amountCents, newBalance]
  );
  wallet.balance_cents = newBalance;
}

async function creditWallet(client, wallet, amountCents, roundId) {
  if (amountCents <= 0) return;
  const newBalance = Number(wallet.balance_cents) + amountCents;
  await client.query(`UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`, [
    newBalance,
    wallet.id,
  ]);
  await client.query(
    `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
     VALUES ($1, 'bet_payout', $2, $3, 'casino_round', $4)`,
    [wallet.id, amountCents, newBalance, roundId]
  );
  wallet.balance_cents = newBalance;
}

class LiveBlackjackTable {
  constructor({ id, name, maxSeats, minBetCents, maxBetCents, emit }) {
    this.id = id;
    this.name = name;
    this.maxSeats = maxSeats;
    this.minBetCents = minBetCents;
    this.maxBetCents = maxBetCents;
    this.emit = emit; // (event, payload) => broadcast a todos en la mesa

    this.shoe = createShoe();
    this.seats = Array.from({ length: maxSeats }, () => null);
    this.spectators = new Set();

    this.phase = 'betting'; // betting | dealing | player_turns | dealer_phase | settlement
    this.dealerCards = [];
    this.activeSeatIndex = -1;
    this.bettingDeadline = 0;
    this.turnDeadline = 0;
    this.resultsDeadline = 0;
    this._timer = null;

    this._startBetting();
  }

  // ---------- estado público ----------

  getPublicState() {
    const dealerHidden = this.phase === 'dealing' || this.phase === 'player_turns';
    return {
      id: this.id,
      name: this.name,
      maxSeats: this.maxSeats,
      minBetCents: this.minBetCents,
      maxBetCents: this.maxBetCents,
      phase: this.phase,
      shoeRemaining: this.shoe.length,
      spectatorCount: this.spectators.size,
      bettingDeadline: this.phase === 'betting' ? this.bettingDeadline : null,
      turnDeadline: this.phase === 'player_turns' ? this.turnDeadline : null,
      resultsDeadline: this.phase === 'settlement' ? this.resultsDeadline : null,
      activeSeatIndex: this.phase === 'player_turns' ? this.activeSeatIndex : -1,
      dealerCards: dealerHidden && this.dealerCards.length ? [this.dealerCards[0], { hidden: true }] : this.dealerCards,
      dealerValue: dealerHidden ? null : handValue(this.dealerCards),
      seats: this.seats.map((seat) =>
        seat
          ? {
              userId: seat.userId,
              name: seat.name,
              connected: seat.connected,
              betCents: seat.betCents,
              cards: seat.cards,
              value: seat.cards.length ? handValue(seat.cards) : null,
              doubled: seat.doubled,
              done: seat.done,
              resultOutcome: seat.resultOutcome,
              payoutCents: seat.payoutCents,
            }
          : null
      ),
    };
  }

  _broadcast() {
    this.emit('table:state', this.getPublicState());
  }

  // ---------- entrar / salir ----------

  seatIndexForUser(userId) {
    return this.seats.findIndex((s) => s && s.userId === userId);
  }

  spectate(userId) {
    if (this.seatIndexForUser(userId) === -1) this.spectators.add(userId);
    this._broadcast();
  }

  takeSeat(userId, name) {
    if (this.seatIndexForUser(userId) !== -1) return; // ya sentado
    const idx = this.seats.findIndex((s) => s === null);
    if (idx === -1) throw Object.assign(new Error('La mesa está llena'), { status: 409 });
    this.spectators.delete(userId);
    this.seats[idx] = {
      userId,
      name,
      connected: true,
      betCents: 0,
      cards: [],
      doubled: false,
      done: false,
      resultOutcome: null,
      payoutCents: null,
    };
    this._broadcast();
  }

  leave(userId) {
    this.spectators.delete(userId);
    const idx = this.seatIndexForUser(userId);
    if (idx === -1) return;
    const seat = this.seats[idx];
    // Si ya apostó y la mano está en curso, no lo saco de la mesa (se
    // resuelve en automático cuando le toque el turno) — solo lo marco
    // desconectado. Si no tiene nada en juego, libero el asiento ya.
    if (seat.betCents > 0 && this.phase !== 'betting' && this.phase !== 'settlement') {
      seat.connected = false;
    } else {
      this.seats[idx] = null;
    }
    this._broadcast();
  }

  disconnectUser(userId) {
    this.leave(userId);
  }

  // ---------- fase de apuestas ----------

  _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _startBetting() {
    this._clearTimer();
    for (const seat of this.seats) if (seat) freshSeatRound(seat);
    this.dealerCards = [];
    this.activeSeatIndex = -1;
    this.phase = 'betting';
    this.bettingDeadline = Date.now() + BETTING_MS;
    this._timer = setTimeout(() => this._endBetting().catch((err) => this._onError(err)), BETTING_MS);
    this._broadcast();
  }

  async placeBet(userId, amountCents) {
    if (this.phase !== 'betting') {
      throw Object.assign(new Error('Las apuestas ya cerraron para esta ronda'), { status: 409 });
    }
    const idx = this.seatIndexForUser(userId);
    if (idx === -1) throw Object.assign(new Error('Tenés que sentarte primero'), { status: 400 });
    const seat = this.seats[idx];
    if (seat.betCents > 0) throw Object.assign(new Error('Ya apostaste en esta ronda'), { status: 409 });
    if (!Number.isInteger(amountCents) || amountCents < this.minBetCents || amountCents > this.maxBetCents) {
      throw Object.assign(
        new Error(`La apuesta debe estar entre ${this.minBetCents} y ${this.maxBetCents} centavos`),
        { status: 400 }
      );
    }

    await withTransaction(async (client) => {
      const wallet = await getWallet(client, userId);
      if (Number(wallet.balance_cents) < amountCents) {
        throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
      }
      await debitWallet(client, wallet, amountCents);
    });

    seat.betCents = amountCents;
    this._broadcast();
  }

  async _endBetting() {
    const playing = this.seats.filter((s) => s && s.betCents > 0);
    if (playing.length === 0) {
      // Nadie apostó: no tiene sentido repartir, se abre otra ventana.
      this._startBetting();
      return;
    }
    await this._deal(playing);
  }

  // ---------- reparto y turnos ----------

  async _deal(playing) {
    this._clearTimer();
    if (this.shoe.length < RESHUFFLE_AT) this.shoe = createShoe();

    for (const seat of playing) seat.cards = [drawCard(this.shoe), drawCard(this.shoe)];
    this.dealerCards = [drawCard(this.shoe), drawCard(this.shoe)];
    for (const seat of playing) {
      if (isBlackjack(seat.cards)) seat.done = true;
    }

    this.phase = 'dealing';
    this._broadcast();

    this._timer = setTimeout(() => {
      if (isBlackjack(this.dealerCards) || playing.every((s) => s.done)) {
        this._dealerPhase(playing).catch((err) => this._onError(err));
      } else {
        this._advanceTurn(playing, 0);
      }
    }, DEAL_PAUSE_MS);
  }

  _advanceTurn(playing, fromIndex) {
    for (let i = fromIndex; i < playing.length; i += 1) {
      if (!playing[i].done) {
        this._playing = playing; // referencia viva para hit/stand/double
        this.activeSeatIndex = this.seats.indexOf(playing[i]);
        this.phase = 'player_turns';
        this.turnDeadline = Date.now() + TURN_MS;
        this._clearTimer();
        this._timer = setTimeout(() => this._autoStand(playing, i).catch((err) => this._onError(err)), TURN_MS);
        this._broadcast();
        return;
      }
    }
    this._dealerPhase(playing).catch((err) => this._onError(err));
  }

  _requireActiveSeat(userId) {
    if (this.phase !== 'player_turns') throw Object.assign(new Error('No es momento de jugar'), { status: 409 });
    const seat = this.seats[this.activeSeatIndex];
    if (!seat || seat.userId !== userId) throw Object.assign(new Error('No es tu turno'), { status: 409 });
    const playingIndex = this._playing.indexOf(seat);
    return { seat, playingIndex };
  }

  async _autoStand(playing, i) {
    if (this.phase !== 'player_turns') return; // ya se resolvió por otra vía
    playing[i].done = true;
    this._advanceTurn(playing, i + 1);
  }

  hit(userId) {
    const { seat, playingIndex } = this._requireActiveSeat(userId);
    seat.cards.push(drawCard(this.shoe));
    if (handValue(seat.cards).value >= 21) seat.done = true;
    if (seat.done) {
      this._advanceTurn(this._playing, playingIndex + 1);
    } else {
      this.turnDeadline = Date.now() + TURN_MS;
      this._clearTimer();
      this._timer = setTimeout(
        () => this._autoStand(this._playing, playingIndex).catch((err) => this._onError(err)),
        TURN_MS
      );
      this._broadcast();
    }
  }

  stand(userId) {
    const { seat, playingIndex } = this._requireActiveSeat(userId);
    seat.done = true;
    this._advanceTurn(this._playing, playingIndex + 1);
  }

  async double(userId) {
    const { seat, playingIndex } = this._requireActiveSeat(userId);
    if (seat.cards.length !== 2 || seat.doubled) {
      throw Object.assign(new Error('Solo podés doblar con 2 cartas'), { status: 400 });
    }
    await withTransaction(async (client) => {
      const wallet = await getWallet(client, userId);
      if (Number(wallet.balance_cents) < seat.betCents) {
        throw Object.assign(new Error('Saldo insuficiente para doblar'), { status: 400 });
      }
      await debitWallet(client, wallet, seat.betCents);
    });
    seat.cards.push(drawCard(this.shoe));
    seat.doubled = true;
    seat.done = true;
    this._advanceTurn(this._playing, playingIndex + 1);
  }

  // ---------- dealer y liquidación ----------

  async _dealerPhase(playing) {
    this._clearTimer();
    this.phase = 'dealer_phase';
    this.activeSeatIndex = -1;
    this._broadcast();

    const allBust = playing.every((s) => handValue(s.cards).value > 21);
    const dealerHasBJ = isBlackjack(this.dealerCards);
    if (!allBust && !dealerHasBJ) {
      this.dealerCards = playDealer(this.shoe, this.dealerCards);
    }

    await withTransaction(async (client) => {
      for (const seat of playing) {
        const effectiveStake = seat.betCents * (seat.doubled ? 2 : 1);
        const { outcome, multiplier } = settleBlackjackHand(seat.cards, this.dealerCards, false);
        const payoutCents = Math.round(effectiveStake * multiplier);
        seat.resultOutcome = outcome;
        seat.payoutCents = payoutCents;

        const insertResult = await client.query(
          `INSERT INTO casino_rounds (user_id, game, stake_cents, outcome, payout_cents)
           VALUES ($1, 'blackjack_live', $2, $3, $4) RETURNING id`,
          [
            seat.userId,
            effectiveStake,
            JSON.stringify({ table: this.id, cards: seat.cards, dealerCards: this.dealerCards, resultOutcome: outcome }),
            payoutCents,
          ]
        );
        const wallet = await getWallet(client, seat.userId);
        await creditWallet(client, wallet, payoutCents, insertResult.rows[0].id);
      }
    });

    this.phase = 'settlement';
    this.resultsDeadline = Date.now() + SETTLE_MS;
    this._broadcast();
    this._timer = setTimeout(() => this._startBetting(), SETTLE_MS);
  }

  _onError(err) {
    // Un error acá no debería trabar la mesa para siempre: lo logueamos y
    // forzamos una vuelta a la fase de apuestas para que la mesa se recupere.
    console.error(`[mesa ${this.id}] error:`, err);
    this._startBetting();
  }
}

module.exports = { LiveBlackjackTable };
