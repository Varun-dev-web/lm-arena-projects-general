import './style.css';
import { BloomGame } from './game.js';
import { GardenAudio } from './audio.js';
import { LocalStore } from './storage.js';
import { formatTime, MAX_LIVES } from './math.js';

const $ = (id) => document.getElementById(id);
const events = new AbortController();
const on = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: events.signal });
const store = new LocalStore();
const audio = new GardenAudio(store.sound);
const canvas = $('game-canvas');
const stage = $('game-stage');
const scoreElement = $('score');
const comboElement = $('combo');
const timerElement = $('timer');
const hearts = [...document.querySelectorAll('#lives .heart')];
const dialogs = [...document.querySelectorAll('dialog')];
const touchButtons = [$('touch-left'), $('touch-right')];
let feedbackTimeout;
let lastScore = -1;
let lastMultiplier = -1;
let resumeAfterDialog = false;
let latestEntryId = null;

function pulse(element) {
  element.classList.remove('bump');
  void element.offsetWidth;
  element.classList.add('bump');
}

function announce(message) { $('global-announcement').textContent = message; }

function updateHud({ score, multiplier, lives, remaining }) {
  if (score !== lastScore) {
    scoreElement.textContent = String(score).padStart(4, '0');
    if (score > lastScore && lastScore >= 0) pulse(scoreElement);
    lastScore = score;
  }
  if (multiplier !== lastMultiplier) {
    comboElement.textContent = `×${multiplier}`;
    if (multiplier > lastMultiplier && lastMultiplier >= 0) pulse(comboElement);
    lastMultiplier = multiplier;
  }
  const time = formatTime(remaining);
  if (timerElement.textContent !== time) timerElement.textContent = time;
  timerElement.parentElement.classList.toggle('urgent', remaining <= 10 && game.state === 'running');
  hearts.forEach((heart, index) => heart.classList.toggle('lost', index >= lives));
  $('lives').setAttribute('aria-label', `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`);
}

function showFeedback(message, wrong) {
  clearTimeout(feedbackTimeout);
  const element = $('game-feedback');
  element.textContent = message;
  element.classList.toggle('wrong', wrong);
  element.classList.toggle('visible', Boolean(message));
  if (message) feedbackTimeout = setTimeout(() => element.classList.remove('visible'), wrong ? 1000 : 720);
}

function updateRound(problem) {
  $('round-prompt').hidden = !problem;
  if (!problem) return;
  $('equation').textContent = `${problem.expression} = ?`;
  $('round-label').textContent = game.round >= 8 ? 'A LITTLE MORE ROOM TO GROW' : 'CATCH THE RIGHT ANSWER';
  const prompt = $('round-prompt');
  prompt.classList.remove('new-round');
  void prompt.offsetWidth;
  prompt.classList.add('new-round');
  const choices = problem.choices.map((choice, index) => `${['left', 'middle', 'right'][index]}: ${choice}`).join(', ');
  $('round-announcement').textContent = `${problem.expression} equals what? ${choices}.`;
}

function updateState(state) {
  $('start-screen').hidden = state !== 'ready';
  $('pause-screen').hidden = state !== 'paused';
  $('gameover-screen').hidden = state !== 'over';
  $('pause-button').disabled = state === 'ready' || state === 'over';
  $('pause-button').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
  $('pause-button').title = state === 'paused' ? 'Resume (Space)' : 'Pause (Space)';
  $('pause-icon').setAttribute('href', state === 'paused' ? '#i-play' : '#i-pause');
  stage.classList.toggle('is-playing', state === 'running');
  touchButtons.forEach((button) => { button.disabled = state !== 'running'; });
  if (state !== 'running') {
    $('round-prompt').hidden = true;
    showFeedback('', false);
    timerElement.parentElement.classList.remove('urgent');
  }
  if (state === 'running') {
    canvas.focus({ preventScroll: true });
    timerElement.parentElement.classList.toggle('urgent', game.remaining <= 10);
  } else if (state === 'paused' && !dialogs.some((dialog) => dialog.open)) {
    $('resume-button').focus({ preventScroll: true });
    announce('Game paused. Your garden is waiting.');
  } else if (state === 'ready') {
    $('round-announcement').textContent = '';
  }
}

function finishRound(result) {
  const saved = store.saveScore(result.score, result.streak);
  latestEntryId = saved.entry.id;
  $('result-score').textContent = result.score.toLocaleString();
  $('result-correct').textContent = result.correct;
  $('result-streak').textContent = result.streak;
  $('result-accuracy').textContent = `${result.accuracy}%`;
  $('result-eyebrow').textContent = saved.isBest ? 'A NEW PERSONAL BEST. THAT’S YOU!' : 'LOOK AT YOU GROW';
  $('result-title').textContent = saved.isBest ? 'Your best kind of growth.' : result.timedOut ? 'A minute well spent.' : 'Every sprout starts somewhere.';
  $('saved-message').lastChild.textContent = !store.persistent ? ' Saved for this visit' : saved.saved ? ' Score saved on this device' : ' A good break. A fresh start next time.';
  renderScores();
  audio.finish(saved.isBest);
  $('restart-button').focus({ preventScroll: true });
  announce(`Round complete. ${result.score} points, ${result.correct} correct catches. ${saved.isBest ? 'A new personal best!' : ''} Press R or choose One more grow to restart.`);
  if (saved.isBest && !game.reducedMotion) $('result-score').animate([{ transform: 'scale(.7)', opacity: 0 }, { transform: 'scale(1.07)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, easing: 'ease-out' });
}

const game = new BloomGame(canvas, { onHud: updateHud, onState: updateState, onRound: updateRound, onFeedback: showFeedback, onFinish: finishRound }, audio);

function renderScores() {
  const tbody = $('score-rows');
  tbody.replaceChildren();
  for (let index = 0; index < 5; index++) {
    const entry = store.scores[index];
    const row = document.createElement('tr');
    if (!entry) row.className = 'empty-score';
    else if (entry.id === latestEntryId) row.className = 'new-score';
    const date = entry ? new Date(entry.date) : null;
    const today = new Date();
    const when = date ? (date.toDateString() === today.toDateString() ? 'Today' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) : '—';
    const values = [String(index + 1).padStart(2, '0'), entry ? entry.score.toLocaleString() : '—', entry ? String(entry.streak) : '—', when];
    values.forEach((value) => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
    if (entry) row.title = `${date.toLocaleString()} · ${entry.score} points · best streak: ${entry.streak}`;
    tbody.append(row);
  }
  const best = store.scores[0]?.score || 0;
  $('personal-best').textContent = best.toLocaleString();
  $('best-caption').textContent = best ? 'A little better, one bloom at a time.' : 'Big things start with a little play.';
  $('clear-scores-button').disabled = store.scores.length === 0;
  if (!store.persistent) $('storage-note').lastChild.textContent = ' Browser storage unavailable. This visit only.';
}

function updateSound() {
  $('sound-icon').setAttribute('href', audio.enabled ? '#i-sound' : '#i-muted');
  $('sound-label').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  $('sound-button').setAttribute('aria-pressed', String(audio.enabled));
  $('sound-button').setAttribute('aria-label', audio.enabled ? 'Turn sound off' : 'Turn sound on');
}

function toggleSound() {
  audio.setEnabled(!audio.enabled);
  store.sound = audio.enabled;
  updateSound();
  if (audio.enabled) audio.click();
}

function beginRound() {
  clearTimeout(feedbackTimeout);
  latestEntryId = null;
  game.start();
  // Keep the entire playfield in view on small screens, without trapping page scroll.
  if (window.innerWidth <= 700) {
    const card = document.querySelector('.game-card');
    const bounds = card.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) card.scrollIntoView({ behavior: game.reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }
}

function togglePause() {
  if (game.state === 'running') game.pause();
  else if (game.state === 'paused') game.resume();
}

function openDialog(dialog) {
  resumeAfterDialog = game.state === 'running';
  if (resumeAfterDialog) game.pause();
  dialog.showModal();
}

on($('start-button'), 'click', beginRound);
on($('restart-button'), 'click', beginRound);
on($('pause-restart-button'), 'click', beginRound);
on($('resume-button'), 'click', () => game.resume());
on($('pause-button'), 'click', togglePause);
on($('home-button'), 'click', () => { game.home(); $('start-button').focus({ preventScroll: true }); });
on($('sound-button'), 'click', () => { toggleSound(); if (game.state === 'running') canvas.focus({ preventScroll: true }); });
on($('help-button'), 'click', () => openDialog($('help-dialog')));
on($('clear-scores-button'), 'click', () => openDialog($('reset-dialog')));
on($('confirm-reset-button'), 'click', () => {
  store.clearScores(); latestEntryId = null; renderScores();
  $('reset-dialog').close(); announce('Your local records have been cleared. A fresh patch of soil!');
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => on(button, 'click', () => button.closest('dialog').close()));
dialogs.forEach((dialog) => {
  on(dialog, 'click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  on(dialog, 'close', () => {
    if (resumeAfterDialog && game.state === 'paused') game.resume();
    resumeAfterDialog = false;
  });
});

on(document, 'keydown', (event) => {
  if (dialogs.some((dialog) => dialog.open) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(key) && game.state === 'running') {
    event.preventDefault(); game.keys.add(key); return;
  }
  if (event.repeat) return;
  if (key === 'm') { event.preventDefault(); toggleSound(); return; }
  if (key === 'r' && (game.state === 'over' || game.state === 'paused')) { event.preventDefault(); beginRound(); return; }
  if (key === 'p' || key === 'Escape') {
    if (game.state === 'running' || game.state === 'paused') { event.preventDefault(); togglePause(); }
    return;
  }
  // Native button activation takes precedence over global game shortcuts.
  if (event.target instanceof Element && event.target.closest('button, a')) return;
  if (key === ' ' || key === 'Enter') {
    event.preventDefault();
    if (game.state === 'ready' || game.state === 'over') beginRound();
    else togglePause();
  }
});
on(document, 'keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  game.keys.delete(key);
});
on(window, 'blur', () => { game.clearInput(); game.pause(); });
on(document, 'visibilitychange', () => { if (document.hidden) { game.clearInput(); game.pause(); } });

on(canvas, 'pointerdown', (event) => {
  if (game.state !== 'running' || !event.isPrimary) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  game.setPointer(event.clientX);
  canvas.focus({ preventScroll: true });
});
on(canvas, 'pointermove', (event) => {
  if (canvas.hasPointerCapture(event.pointerId) && event.isPrimary) game.setPointer(event.clientX);
});
on(canvas, 'pointerup', (event) => { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); });
on(canvas, 'pointercancel', () => { game.pointerTarget = null; });
on(canvas, 'contextmenu', (event) => event.preventDefault());

touchButtons.forEach((button, index) => {
  const direction = index === 0 ? -1 : 1;
  on(button, 'pointerdown', (event) => {
    if (game.state !== 'running') return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    game.pointerTarget = null; game.touchDirection = direction;
  });
  const release = () => { if (game.touchDirection === direction) game.touchDirection = 0; };
  on(button, 'pointerup', release);
  on(button, 'pointercancel', release);
  on(button, 'lostpointercapture', release);
  on(button, 'keydown', (event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); game.touchDirection = direction; } });
  on(button, 'keyup', (event) => { if (event.key === ' ' || event.key === 'Enter') release(); });
  on(button, 'blur', release);
});

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
on(motionPreference, 'change', (event) => { game.reducedMotion = event.matches; game.maxParticles = event.matches ? 28 : 150; });
renderScores();
updateSound();
touchButtons.forEach((button) => { button.disabled = true; });

// A development-only handle makes browser regression checks possible without
// adding a debug surface to the production bundle.
if (import.meta.env.DEV) window.__bloom = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => { events.abort(); game.destroy(); clearTimeout(feedbackTimeout); audio.context?.close(); delete window.__bloom; });
}
