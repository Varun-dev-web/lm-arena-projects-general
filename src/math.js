export const ROUND_SECONDS = 60;
export const MAX_LIVES = 3;

export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function multiplierFor(streak) {
  return Math.min(5, 1 + Math.floor(streak / 3));
}

export function makeProblem(round = 0, random = Math.random) {
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  let a, b, answer, symbol;
  if (round === 0) {
    a = 3; b = 4; answer = 7; symbol = '+';
  } else {
    const level = Math.min(4, Math.floor(round / 4));
    const operation = level === 0 ? 0 : integer(0, Math.min(level + 1, 4));
    if (operation === 0) {
      a = integer(2, level > 1 ? 19 : 7); b = integer(1, level > 1 ? 15 : 5);
      symbol = '+'; answer = a + b;
    } else if (operation === 1) {
      a = integer(7, 12 + level * 6); b = integer(1, a - 1);
      symbol = '−'; answer = a - b;
    } else if (operation === 2) {
      a = integer(2, 5 + level); b = integer(2, 5 + level);
      symbol = '×'; answer = a * b;
    } else if (operation === 3) {
      b = integer(2, 7); answer = integer(2, 7); a = b * answer;
      symbol = '÷';
    } else {
      a = integer(11, 29); b = integer(11, 29);
      symbol = '+'; answer = a + b;
    }
  }
  const answers = new Set([answer]);
  const offsets = shuffle([-3, -2, -1, 1, 2, 3], random);
  for (const offset of offsets) {
    if (answers.size === 3) break;
    if (answer + offset >= 0) answers.add(answer + offset);
  }
  let extra = answer + 4;
  while (answers.size < 3) answers.add(extra++);
  return { a, b, symbol, answer, expression: `${a} ${symbol} ${b}`, choices: shuffle([...answers], random) };
}

export function fallDuration(round) {
  return Math.max(1.7, 3.15 - round * 0.075);
}

export function formatTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
