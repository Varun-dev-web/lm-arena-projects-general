import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProblem, multiplierFor, fallDuration, formatTime, shuffle } from '../src/math.js';

function seededRandom(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

test('the first answer is immediately approachable', () => {
  const problem = makeProblem(0);
  assert.equal(problem.expression, '3 + 4');
  assert.equal(problem.answer, 7);
  assert.equal(problem.choices.length, 3);
  assert(problem.choices.includes(7));
});

test('all difficulty levels produce valid, unique, nonnegative choices', () => {
  const random = seededRandom(421);
  for (let round = 0; round < 100; round++) {
    for (let sample = 0; sample < 100; sample++) {
      const p = makeProblem(round, random);
      let expected;
      if (p.symbol === '+') expected = p.a + p.b;
      if (p.symbol === '−') expected = p.a - p.b;
      if (p.symbol === '×') expected = p.a * p.b;
      if (p.symbol === '÷') expected = p.a / p.b;
      assert.equal(p.answer, expected);
      assert.equal(new Set(p.choices).size, 3);
      assert.equal(p.choices.filter((value) => value === p.answer).length, 1);
      assert(p.choices.every((value) => Number.isInteger(value) && value >= 0));
    }
  }
});

test('combos increase every three catches and cap at five', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9, 12, 30].map(multiplierFor), [1, 1, 1, 2, 2, 3, 4, 5, 5]);
});

test('difficulty ramps smoothly without becoming impossible', () => {
  assert.equal(fallDuration(0), 3.15);
  assert(fallDuration(8) < fallDuration(0));
  assert.equal(fallDuration(100), 1.7);
});

test('timer formatting never displays negative time', () => {
  assert.equal(formatTime(60), '1:00');
  assert.equal(formatTime(59.1), '1:00');
  assert.equal(formatTime(9.2), '0:10');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-2), '0:00');
});

test('shuffle preserves all values and does not mutate input', () => {
  const input = [1, 2, 3];
  assert.deepEqual(shuffle(input, seededRandom(5)), [3, 2, 1]);
  assert.deepEqual(input, [1, 2, 3]);
});
