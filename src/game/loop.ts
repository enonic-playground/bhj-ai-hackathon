/**
 * Fixed-step accumulator with bounded catch-up. Frames longer than the bound
 * are clamped, so a backgrounded tab cannot replay minutes of movement, and a
 * slow frame cannot move an actor further than the simulation allows per step.
 */
export interface FixedStepLoopOptions {
  readonly stepMs: number;
  readonly maxStepsPerFrame: number;
  readonly onStep: (stepSeconds: number) => void;
}

export class FixedStepLoop {
  readonly #stepMs: number;
  readonly #maxFrameMs: number;
  readonly #onStep: (stepSeconds: number) => void;
  #accumulatorMs = 0;

  constructor(options: FixedStepLoopOptions) {
    this.#stepMs = options.stepMs;
    this.#maxFrameMs = options.stepMs * options.maxStepsPerFrame;
    this.#onStep = options.onStep;
  }

  /** Runs whole simulation steps for `elapsedMs` and returns how many ran. */
  advance(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return 0;
    }
    this.#accumulatorMs += Math.min(elapsedMs, this.#maxFrameMs);
    let steps = 0;
    while (this.#accumulatorMs >= this.#stepMs) {
      this.#accumulatorMs -= this.#stepMs;
      this.#onStep(this.#stepMs / 1000);
      steps += 1;
    }
    return steps;
  }

  /** Drops buffered time, for example after regaining focus. */
  reset(): void {
    this.#accumulatorMs = 0;
  }
}
