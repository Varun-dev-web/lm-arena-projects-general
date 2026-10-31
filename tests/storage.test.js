import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore } from '../src/storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('a fresh garden has no invented high scores', () => {
  const store = new LocalStore(memoryStorage());
  assert.deepEqual(store.scores, []);
  assert.equal(store.sound, true);
});

test('scores persist, sort, and retain only the best five', () => {
  const storage = memoryStorage();
  const store = new LocalStore(storage);
  [100, 800, 400, 1200, 600, 200, 900].forEach((score) => store.saveScore(score, score / 100));
  assert.deepEqual(store.scores.map((entry) => entry.score), [1200, 900, 800, 600, 400]);
  assert.deepEqual(new LocalStore(storage).scores.map((entry) => entry.score), [1200, 900, 800, 600, 400]);
});

test('personal best and top-five qualification are reported honestly', () => {
  const store = new LocalStore(memoryStorage());
  assert.equal(store.saveScore(100, 1).isBest, true);
  assert.equal(store.saveScore(100, 1).isBest, false);
  [200, 300, 400, 500].forEach((score) => store.saveScore(score, 2));
  const result = store.saveScore(50, 1);
  assert.equal(result.saved, false);
  assert.equal(result.isBest, false);
});

test('malformed or hostile saved data does not break the game', () => {
  const storage = memoryStorage({ 'bloom.scores.v1': JSON.stringify([null, {}, { score: -1 }, { score: '999' }, { score: 200, streak: 2, date: 12345, id: '<script>bad</script>' }]) });
  const store = new LocalStore(storage);
  assert.equal(store.scores.length, 1);
  assert.equal(store.scores[0].score, 200);
  assert.equal(new LocalStore(memoryStorage({ 'bloom.scores.v1': '{invalid' })).scores.length, 0);
});

test('sound preferences persist and records can be cleared independently', () => {
  const storage = memoryStorage();
  const store = new LocalStore(storage);
  store.saveScore(100, 1); store.sound = false;
  assert.equal(new LocalStore(storage).sound, false);
  store.clearScores();
  assert.equal(store.scores.length, 0);
  assert.equal(store.sound, false);
});

test('blocked and full browser storage gracefully use session memory', () => {
  const blocked = new LocalStore(undefined);
  assert.equal(blocked.persistent, false);
  blocked.saveScore(300, 3);
  assert.equal(blocked.scores[0].score, 300);
  const full = new LocalStore({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} });
  full.saveScore(500, 5);
  assert.equal(full.scores[0].score, 500);
  assert.equal(full.persistent, false);
});
