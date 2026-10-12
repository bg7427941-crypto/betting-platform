import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId = 0;
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function engine({ preferences = {}, deferFetch = false } = {}) {
  const storage = new Map(Object.entries(preferences));
  const contexts = [];
  const sources = [];
  const fetched = [];
  const pending = [];
  let decoded = 0;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  globalThis.document = { hidden: false };
  globalThis.window = {
    addEventListener() {},
    AudioContext: class {
      constructor(options) {
        this.state = 'suspended';
        this.currentTime = 10;
        this.options = options;
        this.destination = {};
        contexts.push(this);
      }
      resume() {
        this.state = 'running';
        return Promise.resolve();
      }
      createGain() {
        return {
          gain: {
            value: 0,
            setTargetAtTime(value) {
              this.value = value;
            },
          },
          connect() {},
          disconnect() {},
        };
      }
      createBufferSource() {
        const source = {
          playbackRate: { value: 1 },
          stopped: false,
          connect() {},
          disconnect() {},
          start(when) {
            this.when = when;
          },
          stop() {
            this.stopped = true;
            this.onended?.();
          },
        };
        sources.push(source);
        return source;
      }
      async decodeAudioData(data) {
        decoded++;
        return { file: new TextDecoder().decode(data).split('/').at(-1) };
      }
    },
  };
  globalThis.fetch = (url) => {
    fetched.push(url);
    const response = { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
    return deferFetch
      ? new Promise((resolve) => pending.push(() => resolve(response)))
      : Promise.resolve(response);
  };
  const sound = await import(`../src/lib/sound.js?test=${++moduleId}`);
  return {
    sound,
    sources,
    contexts,
    storage,
    fetched,
    resolveLoads: () => pending.forEach((resolve) => resolve()),
    decoded: () => decoded,
  };
}

test('preloads each recording once and reuses one audio context for repeated effects', async () => {
  const e = await engine();
  await e.sound.preloadSounds();
  await e.sound.preloadSounds();
  assert.equal(e.contexts.length, 1);
  assert.equal(e.contexts[0].state, 'suspended', 'preloading must not start audio');
  assert.equal(e.fetched.length, 19);
  assert.equal(e.decoded(), 19);
  e.sound.unlockAudio();
  e.sound.playWin();
  e.sound.playWin();
  e.sound.playWin();
  await flush();
  assert.equal(e.sources.length, 3);
  assert.equal(e.contexts.length, 1);
  assert.equal(e.fetched.length, 19);
  assert.ok(e.sources.every((source) => source.buffer.file === 'win.mp3'));
  e.sound.stopAllSounds();
});

test('muting while a recording loads prevents late playback', async () => {
  const e = await engine({ deferFetch: true });
  e.sound.unlockAudio();
  e.sound.playCard();
  e.sound.setMuted(true);
  e.resolveLoads();
  await flush();
  assert.equal(e.sources.length, 0);
  assert.equal(e.storage.get('bj-sound-muted'), '1');
});

test('muting cancels scheduled card sounds as well as current sounds', async () => {
  const e = await engine();
  e.sound.unlockAudio();
  e.sound.playDealSequence(6, 0.12);
  await flush();
  assert.equal(e.sources.length, 6);
  assert.ok(e.sources.at(-1).when > e.contexts[0].currentTime);
  e.sound.setMuted(true);
  assert.ok(e.sources.every((source) => source.stopped));
  e.sound.setMuted(false);
  e.sound.playPush();
  await flush();
  assert.equal(e.sources.at(-1).buffer.file, 'push.mp3');
  assert.equal(e.sources.at(-1).stopped, false);
  e.sound.stopAllSounds();
});

test('leaving a game cancels pending loads even when sound stays enabled', async () => {
  const e = await engine({ deferFetch: true });
  e.sound.unlockAudio();
  e.sound.playBlackjack();
  e.sound.stopAllSounds();
  e.resolveLoads();
  await flush();
  assert.equal(e.sources.length, 0);
  assert.equal(e.sound.isMuted(), false);
});

test('rapid input has a bounded number of active voices and zero volume silences them', async () => {
  const e = await engine();
  e.sound.unlockAudio();
  for (let i = 0; i < 30; i++) e.sound.playChip();
  await flush();
  assert.equal(e.sources.filter((source) => !source.stopped).length, 12);
  e.sound.setVolume(0);
  assert.ok(e.sources.every((source) => source.stopped));
  e.sound.playWin();
  await flush();
  assert.equal(e.sources.length, 30);
});

test('volume preferences are normalized, persisted and sent to all controls', async () => {
  const e = await engine({ preferences: { 'casino-sound-volume': 'invalid' } });
  assert.equal(e.sound.getVolume(), 0.55);
  let changes = 0;
  const unsubscribe = e.sound.subscribe(() => changes++);
  e.sound.setVolume(2);
  assert.equal(e.sound.getVolume(), 1);
  e.sound.setVolume(-1);
  assert.equal(e.sound.getVolume(), 0);
  assert.equal(e.storage.get('casino-sound-volume'), '0');
  assert.equal(changes, 2);
  unsubscribe();
  e.sound.setMuted(true);
  assert.equal(changes, 2);
});

test('win, loss, neutral result and roulette landing use distinct recordings', async () => {
  const e = await engine();
  e.sound.unlockAudio();
  e.sound.playWin();
  e.sound.playLose();
  e.sound.playPush();
  e.sound.playBallLand();
  await flush();
  assert.deepEqual(e.sources.map((source) => source.buffer.file).sort(), [
    'ball-land.mp3',
    'lose.mp3',
    'push.mp3',
    'win.mp3',
  ]);
  e.sound.stopAllSounds();
});

test('a hidden page neither unlocks audio nor queues effects', async () => {
  const e = await engine();
  document.hidden = true;
  e.sound.unlockAudio();
  e.sound.playWin();
  await flush();
  assert.equal(e.contexts.length, 0);
  assert.equal(e.fetched.length, 0);
});

test('a browser that permits autoplay still needs an explicit audio interaction', async () => {
  const e = await engine();
  await e.sound.preloadSounds();
  e.contexts[0].state = 'running';
  e.sound.playWin();
  await flush();
  assert.equal(e.sources.length, 0);
  e.sound.unlockAudio();
  e.sound.playWin();
  await flush();
  assert.equal(e.sources.length, 1);
  e.sound.stopAllSounds();
});
