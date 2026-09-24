/**
 * Frame timing for the animation loop.
 *
 * Time that passes while the page is hidden must never reach the simulation,
 * including the resume countdown. Dropping the loop's buffered time is not
 * enough on its own: the frame clock also has to be rebased, or the first
 * visible frame after an absence reports the whole absence as its own elapsed
 * time and the loop spends its bounded catch-up (`maxStepsPerFrame` steps) on
 * hidden time. With less than that left on the countdown, the round would leave
 * RESUMING and move actors purely because the tab came back.
 *
 * So a suspension clears both: the next frame is treated as the first one and
 * contributes nothing, and the simulation only ever sees visible time.
 */
export interface FrameTimingOptions {
  /** True while the page is hidden and nothing may advance. */
  readonly isHidden: () => boolean;
  /** Runs `elapsedMs` of visible time, normally the fixed-step loop's advance. */
  readonly advance: (elapsedMs: number) => void;
  /** Drops time buffered but not yet run, normally the loop's reset. */
  readonly drop: () => void;
}

export class FrameTiming {
  readonly #options: FrameTimingOptions;
  #previousTime: number | null = null;

  constructor(options: FrameTimingOptions) {
    this.#options = options;
  }

  /** Feeds one animation frame timestamp, in milliseconds, to the simulation. */
  frame(time: number): void {
    const elapsed = this.#previousTime === null ? 0 : time - this.#previousTime;
    this.#previousTime = time;
    if (this.#options.isHidden()) {
      // A frame that still arrives while hidden advances nothing, and the frame
      // after it starts from scratch. The shell also pauses the game itself on
      // a visibility change, so play still waits for an explicit resume.
      this.suspend();
      return;
    }
    this.#options.advance(elapsed);
  }

  /**
   * Discards elapsed and buffered time, for example on blur or either
   * direction of a visibility change. The next frame contributes no time.
   */
  suspend(): void {
    this.#previousTime = null;
    this.#options.drop();
  }
}
