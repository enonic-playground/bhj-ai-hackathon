import { DEFAULT_CONFIG } from '../game/config.js';
import { isDirection } from '../game/direction.js';
import { Game, type GameSnapshot } from '../game/game.js';
import { FixedStepLoop } from '../game/loop.js';
import { handleMovementKey, handlePadDirection } from '../input/inputRouter.js';
import { MazeRenderer } from '../render/renderer.js';

/** Read-only state readout used by browser tests; it never mutates the game. */
export interface HacManTestApi {
  readonly getSnapshot: () => GameSnapshot;
}

declare global {
  interface Window {
    __hacman?: HacManTestApi;
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export function mountApp(): Game {
  const canvas = requireElement<HTMLCanvasElement>('#maze-canvas');
  const stage = requireElement<HTMLElement>('#stage');
  const pad = requireElement<HTMLElement>('#pad');
  const titleScreen = requireElement<HTMLElement>('#title-screen');
  const startButton = requireElement<HTMLButtonElement>('#start-button');
  const scoreOutput = requireElement<HTMLElement>('#hud-score');
  const levelOutput = requireElement<HTMLElement>('#hud-level');
  const modeOutput = requireElement<HTMLElement>('#hud-mode');

  const game = new Game();
  const renderer = new MazeRenderer(canvas, game.maze);
  const loop = new FixedStepLoop({
    stepMs: DEFAULT_CONFIG.simulationStepMs,
    maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
    onStep: (stepSeconds) => game.step(stepSeconds),
  });

  const resize = (): void => {
    renderer.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(stage);
  }
  window.addEventListener('resize', resize);
  resize();

  const updateHud = (): void => {
    const score = String(game.score);
    if (scoreOutput.textContent !== score) {
      scoreOutput.textContent = score;
    }
    const level = String(game.level);
    if (levelOutput.textContent !== level) {
      levelOutput.textContent = level;
    }
    const mode = game.status === 'chase' ? 'Chase' : 'Title';
    if (modeOutput.textContent !== mode) {
      modeOutput.textContent = mode;
    }
  };

  startButton.addEventListener('click', () => {
    game.startLevel();
    titleScreen.hidden = true;
    updateHud();
    resize();
    stage.focus();
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    // Only movement keys the game actually consumed suppress page scrolling.
    if (handleMovementKey(game, event.key)) {
      event.preventDefault();
    }
  });

  const padDirectionFrom = (target: EventTarget | null): string | null => {
    const button = (target as Element | null)?.closest?.('[data-direction]');
    return button?.getAttribute('data-direction') ?? null;
  };

  pad.addEventListener('pointerdown', (event) => {
    const direction = padDirectionFrom(event.target);
    if (direction && isDirection(direction) && handlePadDirection(game, direction)) {
      event.preventDefault();
    }
  });

  // Keyboard activation of a pad button reports no pointer detail.
  pad.addEventListener('click', (event) => {
    if (event.detail !== 0) {
      return;
    }
    const direction = padDirectionFrom(event.target);
    if (direction && isDirection(direction)) {
      handlePadDirection(game, direction);
    }
  });

  const dropHeldInput = (): void => {
    game.clearInput();
    loop.reset();
  };

  window.addEventListener('blur', dropHeldInput);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      dropHeldInput();
    } else {
      loop.reset();
    }
  });

  let previousTime: number | null = null;
  const frame = (time: number): void => {
    const delta = previousTime === null ? 0 : time - previousTime;
    previousTime = time;
    if (document.visibilityState === 'hidden') {
      // The maze does not advance while the page is hidden. M3 replaces this
      // with the full PAUSED state and an explicit resume.
      loop.reset();
    } else {
      loop.advance(delta);
    }
    renderer.draw(game, time);
    updateHud();
    window.requestAnimationFrame(frame);
  };

  updateHud();
  startButton.focus();
  window.requestAnimationFrame(frame);

  window.__hacman = { getSnapshot: () => game.snapshot() };

  return game;
}
