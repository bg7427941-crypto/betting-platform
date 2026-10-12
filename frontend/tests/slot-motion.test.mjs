import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planReelLanding,
  REEL_CYCLE_ROWS,
  REEL_TRACK_ROWS,
  SLOT_RHYTHMS,
} from '../src/lib/slotMotion.js';

test('landing preserves the visible symbols and fits all three result rows', () => {
  const boundary = planReelLanding(REEL_CYCLE_ROWS, SLOT_RHYTHMS.normal);
  assert.ok(boundary.target + 3 <= REEL_TRACK_ROWS);
  for (let offset = 0; offset <= REEL_CYCLE_ROWS; offset += 0.025) {
    const landing = planReelLanding(offset, SLOT_RHYTHMS.normal);
    assert.ok(landing.target >= Math.floor(offset) + 4);
    assert.ok(landing.target + 3 <= REEL_TRACK_ROWS);
    assert.equal(landing.from, offset);
  }
});

test('braking begins at the loop velocity rather than speeding up', () => {
  for (const rhythm of Object.values(SLOT_RHYTHMS)) {
    for (const offset of [0, 0.25, 1.6, 3.99, 5.1, 6]) {
      const landing = planReelLanding(offset, rhythm);
      const loopVelocity = REEL_CYCLE_ROWS / rhythm.cycle;
      const initialY = Number(landing.easing.split(',')[1]);
      const initialBrakeVelocity =
        ((landing.target - offset) / landing.duration) * (initialY / 0.25);
      assert.ok(Math.abs(initialBrakeVelocity / loopVelocity - 1) < 0.002);
      assert.ok(landing.duration >= 700);
    }
  }
});

test('both rhythms leave time for anticipation, staggered stops and result reading', () => {
  for (const rhythm of Object.values(SLOT_RHYTHMS)) {
    assert.ok(rhythm.minimum >= 250);
    assert.ok(rhythm.stagger >= 85);
    assert.ok(rhythm.reveal >= 220);
    assert.ok(rhythm.grace >= 180);
  }
  assert.ok(SLOT_RHYTHMS.normal.minimum > SLOT_RHYTHMS.fast.minimum);
  assert.ok(SLOT_RHYTHMS.normal.cycle > SLOT_RHYTHMS.fast.cycle);
});

test('all five reels finish from left to right regardless of the response phase', () => {
  for (const rhythm of Object.values(SLOT_RHYTHMS)) {
    for (let phase = 0; phase <= REEL_CYCLE_ROWS; phase += 0.05) {
      let previous = 0;
      for (let reel = 0; reel < 5; reel++) {
        const landing = planReelLanding((phase + reel * 0.025) % REEL_CYCLE_ROWS, rhythm, reel);
        assert.ok(landing.duration > previous);
        const initialY = Number(landing.easing.split(',')[1]);
        assert.ok(initialY > 0 && initialY < 1);
        const velocity = (((landing.target - landing.from) / landing.duration) * initialY) / 0.25;
        assert.ok(Math.abs(velocity - REEL_CYCLE_ROWS / rhythm.cycle) < 0.000001);
        previous = landing.duration;
      }
    }
  }
});
