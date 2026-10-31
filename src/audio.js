export class GardenAudio {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
    this.master = null;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.16;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Sound is optional on restricted browsers. */ }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.unlock();
    if (this.master && this.context) this.master.gain.setTargetAtTime(enabled ? 0.16 : 0, this.context.currentTime, 0.025);
  }

  tone(frequency, duration = 0.16, delay = 0, type = 'sine', volume = 0.5, endFrequency) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  start() {
    this.unlock();
    [392, 494, 587, 784].forEach((note, i) => this.tone(note, 0.22, i * 0.07, 'sine', 0.4));
  }

  catch(streak) {
    const notes = [523, 587, 659, 784, 880];
    const note = notes[(streak - 1) % notes.length];
    this.tone(note, 0.2, 0, 'sine', 0.6);
    this.tone(note * 1.5, 0.25, 0.055, 'sine', 0.28);
    if (streak % 3 === 0) this.tone(note * 2, 0.35, 0.12, 'triangle', 0.22);
  }

  miss() {
    this.tone(220, 0.2, 0, 'triangle', 0.45, 130);
    this.tone(164, 0.24, 0.08, 'sine', 0.35, 110);
  }

  tick() { this.tone(740, 0.07, 0, 'sine', 0.18); }
  click() { this.tone(587, 0.09, 0, 'sine', 0.25); }
  finish(best) {
    const melody = best ? [523, 659, 784, 1047] : [659, 587, 523];
    melody.forEach((note, i) => this.tone(note, 0.4, i * 0.13, 'sine', 0.4));
  }
}
