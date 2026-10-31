import { makeProblem, multiplierFor, fallDuration, ROUND_SECONDS, MAX_LIVES } from './math.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const COLORS = [
  { fill: '#f7d784', edge: '#dfbd65', ink: '#806334' },
  { fill: '#d9cfe9', edge: '#bdb0d2', ink: '#756387' },
  { fill: '#f2b99b', edge: '#dca080', ink: '#8b5d43' },
];
const PRAISE = ['Lovely little catch!', 'Look at you grow!', 'Nicely done!', 'A bright little mind!', 'You’re a natural!'];

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

export class BloomGame {
  constructor(canvas, callbacks = {}, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.callbacks = callbacks;
    this.audio = audio;
    this.state = 'ready';
    this.width = 800;
    this.height = 500;
    this.dpr = 1;
    this.clock = 0;
    this.lastFrame = 0;
    this.keys = new Set();
    this.touchDirection = 0;
    this.pointerTarget = null;
    this.player = { x: 400, velocity: 0, bounce: 0, hurt: 0 };
    this.particles = [];
    this.flowers = [];
    this.tokens = [];
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.correct = 0;
    this.misses = 0;
    this.lives = MAX_LIVES;
    this.round = 0;
    this.remaining = ROUND_SECONDS;
    this.shake = 0;
    this.flash = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.maxParticles = this.reducedMotion ? 28 : 150;
    this.background = document.createElement('canvas');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.frame = this.frame.bind(this);
    this.animationId = requestAnimationFrame(this.frame);
    document.fonts.ready.then(() => this.buildBackground());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const oldWidth = this.width;
    const oldCatchY = this.catchY;
    const oldSpawnY = this.spawnY;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.player.x = clamp(this.player.x / oldWidth * this.width, this.playerRadius + 5, this.width - this.playerRadius - 5);
    this.pointerTarget = this.pointerTarget === null ? null : this.pointerTarget / oldWidth * this.width;
    for (const token of this.tokens) {
      token.x = token.lane * this.width;
      const progress = (token.y - oldSpawnY) / Math.max(1, oldCatchY - oldSpawnY);
      token.y = this.spawnY + progress * (this.catchY - this.spawnY);
      token.radius = this.tokenRadius;
      token.speed = (this.catchY - this.spawnY) / fallDuration(this.round);
    }
    for (const flower of this.flowers) { flower.x = flower.relativeX * this.width; flower.y = this.height - flower.groundOffset; }
    this.particles.length = 0;
    this.buildBackground();
  }

  get compact() { return this.height < 330; }
  get playerRadius() { return this.compact ? 24 : this.width < 450 ? 31 : 36; }
  get catchY() { return this.height - (this.compact ? 76 : this.width < 450 ? 94 : 103); }
  get tokenRadius() { return clamp(this.width * 0.044, this.compact ? 22 : 24, this.compact ? 27 : 34); }
  get spawnY() { return this.compact ? 90 : this.width < 450 ? 111 : 116; }

  buildBackground() {
    const width = this.width, height = this.height;
    this.background.width = Math.round(width * this.dpr);
    this.background.height = Math.round(height * this.dpr);
    const ctx = this.background.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#edf2df');
    sky.addColorStop(1, '#e5edcf');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    // A warm little sun, with the quietest hint of a face.
    const sunX = width * .83, sunY = height * .19;
    ctx.fillStyle = '#f3e7ad';
    ctx.beginPath(); ctx.arc(sunX, sunY, 30, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e7d995'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      ctx.beginPath(); ctx.moveTo(sunX + Math.cos(angle) * 37, sunY + Math.sin(angle) * 37);
      ctx.lineTo(sunX + Math.cos(angle) * 42, sunY + Math.sin(angle) * 42); ctx.stroke();
    }
    ctx.fillStyle = '#c6b875';
    ctx.beginPath(); ctx.arc(sunX - 8, sunY, 1.5, 0, TAU); ctx.arc(sunX + 8, sunY, 1.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c6b875'; ctx.beginPath(); ctx.arc(sunX, sunY + 3, 4, 0, Math.PI); ctx.stroke();

    this.cloud(ctx, width * .13, height * .18, .9);
    this.cloud(ctx, width * .62, height * .32, .65);
    this.cloud(ctx, width * .94, height * .48, .8);

    ctx.fillStyle = '#dce6c4';
    ctx.beginPath(); ctx.moveTo(0, height * .72);
    ctx.bezierCurveTo(width * .17, height * .49, width * .31, height * .64, width * .48, height * .73);
    ctx.bezierCurveTo(width * .7, height * .83, width * .76, height * .53, width, height * .64);
    ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();
    ctx.fillStyle = '#cfdeb4';
    ctx.beginPath(); ctx.moveTo(0, height * .83);
    ctx.bezierCurveTo(width * .25, height * .65, width * .43, height * .82, width * .62, height * .81);
    ctx.bezierCurveTo(width * .82, height * .78, width * .9, height * .71, width, height * .75);
    ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();
    ctx.fillStyle = '#c3d5a4';
    ctx.beginPath(); ctx.moveTo(0, height - 48);
    ctx.bezierCurveTo(width * .23, height - 70, width * .51, height - 30, width * .7, height - 47);
    ctx.quadraticCurveTo(width * .9, height - 65, width, height - 45);
    ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.fill();
    ctx.fillStyle = '#bbcf9a'; ctx.fillRect(0, height - 18, width, 18);

    // Deterministic details are cached, not redrawn every frame.
    for (let i = 0; i < 31; i++) {
      const x = ((i * 137.508) % width);
      const y = height - 10 - ((i * 17.13) % 46);
      ctx.strokeStyle = i % 2 ? '#a8c187' : '#afc58e'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x - 3, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + 3, y - 7); ctx.stroke();
      if (i % 4 === 0) {
        ctx.fillStyle = '#eef1d7';
        ctx.beginPath(); ctx.arc(x + 8, y - 6, 2.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#dfc778'; ctx.beginPath(); ctx.arc(x + 8, y - 6, 1.2, 0, TAU); ctx.fill();
      }
    }
  }

  cloud(ctx, x, y, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = '#f9faee'; ctx.globalAlpha = .72;
    ctx.beginPath(); ctx.moveTo(-43, 10); ctx.bezierCurveTo(-58, 8, -51, -10, -36, -9);
    ctx.bezierCurveTo(-37, -35, -2, -37, 5, -16); ctx.bezierCurveTo(23, -27, 42, -12, 39, 0);
    ctx.bezierCurveTo(61, -2, 62, 16, 43, 16); ctx.lineTo(-43, 16); ctx.fill(); ctx.restore();
  }

  setState(state) {
    this.state = state;
    this.callbacks.onState?.(state);
  }

  clearInput() {
    this.keys.clear(); this.touchDirection = 0; this.pointerTarget = null; this.player.velocity = 0;
  }

  start() {
    this.clearInput();
    this.score = 0; this.streak = 0; this.bestStreak = 0; this.correct = 0; this.misses = 0;
    this.lives = MAX_LIVES; this.remaining = ROUND_SECONDS; this.round = 0;
    this.lastWholeSecond = ROUND_SECONDS; this.endingDelay = 0;
    this.tokens = []; this.particles = []; this.flowers = [];
    this.player.x = this.width / 2; this.player.bounce = 0; this.player.hurt = 0;
    this.shake = 0; this.flash = 0; this.roundDelay = .3; this.roundResolved = false;
    this.problem = null;
    this.setState('running');
    this.emitHud();
    this.callbacks.onRound?.(null);
    this.audio?.start();
  }

  pause() {
    if (this.state !== 'running') return;
    this.clearInput(); this.setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.clearInput(); this.audio?.unlock(); this.setState('running');
  }

  home() {
    this.clearInput(); this.tokens = []; this.particles = []; this.flowers = [];
    this.score = 0; this.streak = 0; this.lives = MAX_LIVES; this.remaining = ROUND_SECONDS;
    this.shake = 0; this.flash = 0;
    this.setState('ready'); this.emitHud(); this.callbacks.onRound?.(null);
  }

  finish() {
    if (this.state !== 'running') return;
    this.clearInput();
    this.setState('over');
    this.callbacks.onRound?.(null);
    this.callbacks.onFeedback?.('', false);
    const attempts = this.correct + this.misses;
    this.callbacks.onFinish?.({ score: this.score, streak: this.bestStreak, correct: this.correct, accuracy: attempts ? Math.round(this.correct / attempts * 100) : 0, timedOut: this.remaining <= 0 });
  }

  emitHud() {
    this.callbacks.onHud?.({ score: this.score, streak: this.streak, multiplier: multiplierFor(this.streak), lives: this.lives, remaining: this.remaining });
  }

  spawnRound() {
    this.problem = makeProblem(this.round);
    this.roundResolved = false;
    const radius = this.tokenRadius;
    const startY = this.spawnY;
    const colorOffset = this.round % 3;
    this.tokens = this.problem.choices.map((value, index) => {
      const lane = [.19, .5, .81][index];
      return { value, lane, x: lane * this.width, y: startY - (index === 1 ? 9 : 0), radius, speed: (this.catchY - startY) / fallDuration(this.round), color: COLORS[(index + colorOffset) % 3], phase: index * 2.1 + this.round, status: 'falling', alpha: 1 };
    });
    this.callbacks.onRound?.(this.problem);
  }

  setPointer(clientX) {
    if (this.state !== 'running') return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointerTarget = clamp(clientX - rect.left, this.playerRadius + 5, this.width - this.playerRadius - 5);
  }

  resolveRound(token, missed = false) {
    if (this.roundResolved || this.state !== 'running') return;
    this.roundResolved = true;
    const won = !missed && token?.value === this.problem.answer;
    if (won) {
      this.streak++;
      this.correct++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      const multiplier = multiplierFor(this.streak);
      const points = 100 * multiplier;
      this.score += points;
      token.status = 'caught';
      this.player.bounce = 1;
      this.shake = this.reducedMotion ? 0 : (this.streak % 3 === 0 ? 4 : 2);
      this.burst(token.x, this.catchY - 8, token.color.fill, this.streak % 3 === 0 ? 36 : 23);
      this.floatText(`+${points}`, this.player.x, this.catchY - 72, '#416d43');
      this.plantFlower();
      const praise = this.streak % 3 === 0 ? `Growing strong! ×${multiplier}` : PRAISE[(this.correct - 1) % PRAISE.length];
      this.callbacks.onFeedback?.(praise, false);
      this.audio?.catch(this.streak);
      for (const other of this.tokens) {
        if (other === token) continue;
        other.status = 'fading';
        this.burst(other.x, other.y, other.color.fill, 5);
      }
      this.roundDelay = .72;
    } else {
      this.lives--;
      this.misses++;
      this.streak = 0;
      this.player.hurt = .8;
      this.shake = this.reducedMotion ? 0 : 9;
      this.flash = .25;
      if (token) { token.status = 'wrong'; this.burst(token.x, this.catchY, '#db947e', 20); }
      for (const other of this.tokens) {
        if (other.value === this.problem.answer) other.status = 'correct';
        else if (other !== token) other.status = 'fading';
      }
      this.callbacks.onFeedback?.(`${missed ? 'Missed it!' : 'Not quite!'} ${this.problem.expression} = ${this.problem.answer}`, true);
      this.audio?.miss();
      this.roundDelay = 1.05;
      if (this.lives <= 0) this.endingDelay = .85;
    }
    this.emitHud();
  }

  plantFlower() {
    if (this.flowers.length >= 22) this.flowers.shift();
    const relativeX = .04 + Math.random() * .92;
    const groundOffset = 12 + Math.random() * 26;
    this.flowers.push({ x: relativeX * this.width, relativeX, y: this.height - groundOffset, groundOffset, growth: 0, size: 16 + Math.random() * 17, color: ['#f4d47d', '#f2b49b', '#e8dff0', '#faf3d4'][this.correct % 4], phase: Math.random() * TAU });
  }

  burst(x, y, color, count) {
    const amount = this.reducedMotion ? Math.min(count, 6) : count;
    for (let i = 0; i < amount && this.particles.length < this.maxParticles; i++) {
      const angle = Math.random() * TAU;
      const speed = 50 + Math.random() * 160;
      this.particles.push({ type: 'petal', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 65, life: .55 + Math.random() * .45, maxLife: 1, size: 2 + Math.random() * 4, color: i % 3 === 0 ? '#fff9df' : color, rotation: Math.random() * TAU, spin: (Math.random() - .5) * 8 });
    }
  }

  floatText(text, x, y, color) {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({ type: 'text', text, x, y, vx: 0, vy: -48, life: 1, maxLife: 1, color, size: 25 });
  }

  update(dt) {
    this.clock += dt;
    if (this.state !== 'running') return;
    this.shake = Math.max(0, this.shake - dt * 24);
    this.flash = Math.max(0, this.flash - dt);
    this.player.bounce = Math.max(0, this.player.bounce - dt * 3.8);
    this.player.hurt = Math.max(0, this.player.hurt - dt);
    for (const flower of this.flowers) flower.growth = Math.min(1, flower.growth + dt * 2.8);
    this.updateParticles(dt);

    if (this.endingDelay > 0) {
      this.endingDelay -= dt;
      if (this.endingDelay <= 0) { this.finish(); return; }
    } else {
      this.remaining = Math.max(0, this.remaining - dt);
      const wholeSecond = Math.ceil(this.remaining);
      if (wholeSecond !== this.lastWholeSecond) {
        this.lastWholeSecond = wholeSecond;
        this.emitHud();
        if (wholeSecond <= 5 && wholeSecond > 0) this.audio?.tick();
      }
      if (this.remaining <= 0) { this.emitHud(); this.finish(); return; }
    }

    const previousX = this.player.x;
    let direction = this.touchDirection;
    if (this.keys.has('ArrowLeft') || this.keys.has('a')) direction -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('d')) direction += 1;
    direction = clamp(direction, -1, 1);
    if (direction) {
      this.pointerTarget = null;
      this.player.velocity = lerp(this.player.velocity, direction * this.width * 1.22, 1 - Math.exp(-dt * 25));
    } else if (this.pointerTarget !== null) {
      const delta = this.pointerTarget - this.player.x;
      this.player.velocity = clamp(delta * 20, -this.width * 2.2, this.width * 2.2);
    } else {
      this.player.velocity *= Math.exp(-dt * 25);
    }
    this.player.x = clamp(this.player.x + this.player.velocity * dt, this.playerRadius + 5, this.width - this.playerRadius - 5);
    if (dt > 0) this.player.velocity = (this.player.x - previousX) / dt;

    if (this.roundResolved) {
      for (const token of this.tokens) {
        if (token.status === 'fading' || token.status === 'caught') token.alpha = Math.max(0, token.alpha - dt * 4);
        else if (token.status === 'correct') token.y += token.speed * dt * .12;
      }
      if (!this.endingDelay) {
        this.roundDelay -= dt;
        if (this.roundDelay <= 0) { this.round++; this.spawnRound(); }
      }
      return;
    }
    if (!this.problem) {
      this.roundDelay -= dt;
      if (this.roundDelay <= 0) this.spawnRound();
      return;
    }

    for (const token of this.tokens) {
      const previousY = token.y;
      token.y += token.speed * dt;
      const intersectsX = Math.abs(token.x - this.player.x) < this.playerRadius + token.radius * .55;
      const crossesRim = token.y + token.radius * .65 >= this.catchY && previousY - token.radius * .65 <= this.catchY + 18;
      if (intersectsX && crossesRim) {
        this.resolveRound(token);
        break;
      }
      if (token.value === this.problem.answer && token.y - token.radius > this.catchY + 20) {
        this.resolveRound(null, true);
        break;
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) { this.particles.splice(i, 1); continue; }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      if (particle.type === 'petal') { particle.vy += 230 * dt; particle.rotation += particle.spin * dt; }
    }
  }

  frame(timestamp) {
    const dt = this.lastFrame ? Math.min((timestamp - this.lastFrame) / 1000, .1) : 0;
    this.lastFrame = timestamp;
    // Small substeps keep collision detection reliable on slower phones.
    const steps = Math.max(1, Math.ceil(dt / (1 / 100)));
    for (let i = 0; i < steps; i++) this.update(dt / steps);
    this.render();
    this.animationId = requestAnimationFrame(this.frame);
  }

  render() {
    const ctx = this.ctx, width = this.width, height = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.background, 0, 0, width, height);
    ctx.save();
    if (this.shake > 0 && this.state === 'running') ctx.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake);
    this.drawAmbient(ctx);
    for (const flower of this.flowers) this.drawFlower(ctx, flower);
    if (this.state !== 'ready') {
      this.drawLanes(ctx);
      for (const token of this.tokens) if (token.alpha > 0) this.drawToken(ctx, token);
      this.drawPlayer(ctx);
    }
    this.drawParticles(ctx);
    ctx.restore();
    if (this.flash > 0 && !this.reducedMotion) {
      ctx.fillStyle = `rgba(212, 115, 86, ${this.flash * .32})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  drawAmbient(ctx) {
    const time = this.reducedMotion || this.state === 'paused' ? 0 : this.clock;
    ctx.fillStyle = '#faf9df';
    for (let i = 0; i < 12; i++) {
      const x = ((i * 137.5 + time * (3 + i % 3)) % (this.width + 20)) - 10;
      const y = this.height * (.22 + (i % 5) * .12) + Math.sin(time * .5 + i) * 9;
      ctx.globalAlpha = .35 + Math.sin(time + i) * .15;
      ctx.beginPath(); ctx.arc(x, y, i % 3 === 0 ? 2 : 1.3, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawLanes(ctx) {
    ctx.strokeStyle = '#8faa6e'; ctx.globalAlpha = .13; ctx.lineWidth = 1; ctx.setLineDash([3, 9]);
    for (const lane of [.19, .5, .81]) {
      ctx.beginPath(); ctx.moveTo(lane * this.width, this.compact ? 80 : 135); ctx.lineTo(lane * this.width, this.catchY - 20); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  drawToken(ctx, token) {
    const r = token.radius;
    const wobble = this.reducedMotion ? 0 : Math.sin(this.clock * 2.3 + token.phase) * .065;
    ctx.save(); ctx.translate(token.x, token.y); ctx.rotate(wobble); ctx.globalAlpha = token.alpha;
    const correct = token.status === 'correct', wrong = token.status === 'wrong';
    const fill = correct ? '#e5f1c9' : wrong ? '#f2c1ae' : token.color.fill;
    const edge = correct ? '#87a96b' : wrong ? '#c77e67' : token.color.edge;
    ctx.fillStyle = '#5b70451a'; roundedRect(ctx, -r, -r + 5, r * 2, r * 2, r * .57); ctx.fill();
    ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = correct ? 2.5 : 1.5;
    roundedRect(ctx, -r, -r, r * 2, r * 2, r * .57); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffffff65'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r + 9, -r + 8); ctx.lineTo(r - 11, -r + 8); ctx.stroke();
    // A seed leaf on every answer: no color advantage for the correct one.
    ctx.fillStyle = edge; ctx.beginPath(); ctx.moveTo(r * .35, -r + 1); ctx.quadraticCurveTo(r * .3, -r - 12, r * .75, -r - 9); ctx.quadraticCurveTo(r * .85, -r - 1, r * .35, -r + 1); ctx.fill();
    ctx.fillStyle = correct ? '#4f773e' : wrong ? '#9b5947' : token.color.ink;
    ctx.font = `450 ${r * .94}px "Fredoka Variable", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(token.value), 0, 2);
    if (correct) {
      ctx.strokeStyle = '#5b8046'; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(-7, r + 10); ctx.lineTo(-2, r + 15); ctx.lineTo(8, r + 5); ctx.stroke();
    }
    ctx.restore();
  }

  drawPlayer(ctx) {
    const radius = this.playerRadius;
    const scale = radius / 36;
    const bounce = this.reducedMotion ? 0 : Math.sin(this.player.bounce * Math.PI) * .13;
    const tilt = this.reducedMotion ? 0 : clamp(this.player.velocity / this.width * .11, -.12, .12);
    const bob = this.reducedMotion || this.state !== 'running' ? 0 : Math.sin(this.clock * 4) * 1.1;
    ctx.save(); ctx.translate(this.player.x, this.height - (this.compact ? 49 : 64) + bob);
    ctx.fillStyle = '#6b874333'; ctx.beginPath(); ctx.ellipse(0, 34, 43 * scale, 8 * scale, 0, 0, TAU); ctx.fill();
    ctx.rotate(tilt); ctx.scale(scale * (1 + bounce), scale * (1 - bounce));
    if (this.player.hurt > 0 && Math.floor(this.player.hurt * 14) % 2 === 0) ctx.globalAlpha = .55;
    ctx.strokeStyle = '#4f7548'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(-3, -56, 2, -82); ctx.stroke();
    ctx.fillStyle = '#7fa660'; ctx.beginPath(); ctx.moveTo(0, -57); ctx.bezierCurveTo(-31, -52, -47, -72, -42, -89); ctx.bezierCurveTo(-17, -93, 2, -78, 0, -57); ctx.fill();
    ctx.strokeStyle = '#5d864b'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-1, -59); ctx.lineTo(-30, -79); ctx.stroke();
    ctx.fillStyle = '#537e4d'; ctx.beginPath(); ctx.moveTo(1, -75); ctx.bezierCurveTo(-2, -102, 20, -116, 42, -110); ctx.bezierCurveTo(44, -87, 25, -72, 1, -75); ctx.fill();
    ctx.strokeStyle = '#9dbb77'; ctx.beginPath(); ctx.moveTo(3, -77); ctx.lineTo(29, -100); ctx.stroke();
    ctx.fillStyle = '#96b772'; ctx.beginPath(); ctx.moveTo(0, -37); ctx.bezierCurveTo(17, -61, 36, -58, 39, -47); ctx.bezierCurveTo(32, -30, 13, -30, 0, -37); ctx.fill();
    ctx.fillStyle = '#d98a5f'; ctx.beginPath(); ctx.moveTo(-32, -5); ctx.lineTo(-24, 29); ctx.quadraticCurveTo(-23, 35, -15, 35); ctx.lineTo(16, 35); ctx.quadraticCurveTo(23, 35, 25, 28); ctx.lineTo(32, -5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#efb184'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-24, 6); ctx.lineTo(-19, 25); ctx.stroke();
    ctx.fillStyle = '#eca578'; roundedRect(ctx, -38, -18, 76, 18, 6); ctx.fill();
    ctx.strokeStyle = '#ffc89a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-29, -13); ctx.lineTo(29, -13); ctx.stroke();
    const blink = this.clock % 4.7 > 4.53;
    ctx.fillStyle = '#554232';
    for (const x of [-11, 11]) { ctx.beginPath(); ctx.ellipse(x, 13, 2.5, blink ? .7 : 3.5, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#554232'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, 20); ctx.quadraticCurveTo(0, this.player.hurt > 0 ? 15 : 26, 5, 20); ctx.stroke();
    ctx.fillStyle = '#e58c72'; ctx.beginPath(); ctx.ellipse(-19, 19, 4.5, 2.5, 0, 0, TAU); ctx.ellipse(19, 19, 4.5, 2.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawFlower(ctx, flower) {
    const growth = 1 - Math.pow(1 - flower.growth, 3);
    const sway = this.reducedMotion ? 0 : Math.sin(this.clock * 1.5 + flower.phase) * .045;
    ctx.save(); ctx.translate(flower.x, flower.y); ctx.rotate(sway); ctx.scale(growth, growth);
    const size = flower.size;
    ctx.strokeStyle = '#7d9e59'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(3, -size * .5, 0, -size); ctx.stroke();
    ctx.fillStyle = '#8eac65'; ctx.beginPath(); ctx.ellipse(-4, -size * .4, 5, 2.5, .6, 0, TAU); ctx.fill();
    ctx.fillStyle = flower.color;
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * TAU;
      ctx.beginPath(); ctx.arc(Math.cos(angle) * 5, -size + Math.sin(angle) * 5, 4.5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#d4ac58'; ctx.beginPath(); ctx.arc(0, -size, 3, 0, TAU); ctx.fill(); ctx.restore();
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      ctx.save(); ctx.globalAlpha = Math.min(1, particle.life * 2);
      ctx.translate(particle.x, particle.y); ctx.fillStyle = particle.color;
      if (particle.type === 'text') {
        ctx.font = '500 25px "Fredoka Variable", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(particle.text, 0, 0);
      } else {
        ctx.rotate(particle.rotation); ctx.beginPath(); ctx.ellipse(0, 0, particle.size, particle.size * .55, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  destroy() {
    cancelAnimationFrame(this.animationId);
    this.resizeObserver.disconnect();
    this.clearInput();
  }
}
