export const REEL_CYCLE_ROWS = 6;
export const REEL_TRACK_ROWS = 13;
export const SLOT_RHYTHMS = {
  normal: { cycle: 1200, minimum: 600, brake: 1050, stagger: 170, reveal: 300, grace: 240 },
  fast: { cycle: 900, minimum: 250, brake: 750, stagger: 85, reveal: 220, grace: 180 },
};

// Leave the four currently visible tiles intact, then bring the actual result
// into view. Each reel has a fixed finishing time; adjusting the initial easing
// slope preserves its loop velocity while guaranteeing left-to-right stops.
export function planReelLanding(offsetRows, rhythm, reel = 0) {
  const from = Math.max(0, Math.min(REEL_CYCLE_ROWS, offsetRows));
  const target = Math.floor(from) + 4;
  const distance = target - from;
  const duration = rhythm.brake + reel * rhythm.stagger;
  const initialY = (((REEL_CYCLE_ROWS / rhythm.cycle) * duration) / distance) * 0.25;
  return {
    from,
    target,
    duration,
    easing: `cubic-bezier(0.25, ${initialY}, 0.4, 1)`,
  };
}
