class GraduationSoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private ambientInterval: number | null = null;
  private isAmbientPlaying = false;

  private ensureContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.isAmbientPlaying) {
      this.stopAmbientChime();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public isPlayingAmbient(): boolean {
    return this.isAmbientPlaying;
  }

  public playSoftClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.065);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playEnvelopeOpenChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Warm C-major 9th harp arpeggio
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const startTime = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.11, startTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + 1.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.2);
    });
  }

  public playCelebrationFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    const now = ctx.currentTime;

    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      const start = now + i * 0.045;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.095, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 1.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.5);
    });
  }

  public toggleAmbientChime(): boolean {
    if (this.isAmbientPlaying) {
      this.stopAmbientChime();
      return false;
    }
    this.startAmbientChime();
    return true;
  }

  public startAmbientChime(): void {
    if (this.isAmbientPlaying) return;
    this.isAmbientPlaying = true;
    const melody = [523.25, 659.25, 783.99, 659.25, 880.0, 783.99, 659.25, 587.33];
    let step = 0;

    const playNote = () => {
      if (!this.isAmbientPlaying || this.isMuted) return;
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(melody[step % melody.length], now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.035, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 1.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.35);
      step += 1;
    };

    playNote();
    this.ambientInterval = window.setInterval(playNote, 1400);
  }

  public stopAmbientChime(): void {
    this.isAmbientPlaying = false;
    if (this.ambientInterval !== null) {
      window.clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
  }
}

export const soundEngine = new GraduationSoundEngine();
