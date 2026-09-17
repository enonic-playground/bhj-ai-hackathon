import { DEFAULT_CONFIG } from '../game/config.js';
import { isDirection } from '../game/direction.js';
import { Game, type GameSnapshot, type GameStatus, type GuessResult } from '../game/game.js';
import { FixedStepLoop } from '../game/loop.js';
import { ALPHABET } from '../game/words.js';
import { handleGameKey, handleLetterButton, handlePadDirection } from '../input/inputRouter.js';
import { MazeRenderer } from '../render/renderer.js';
import { readTestFixture } from './fixture.js';
import { FrameTiming } from './frameTiming.js';

/** Read-only state readout used by browser tests; it never mutates the game. */
export interface HacManTestApi {
  readonly getSnapshot: () => GameSnapshot;
}

declare global {
  interface Window {
    __hacman?: HacManTestApi;
  }
}

const MODE_LABELS: Record<GameStatus, string> = {
  title: 'Title',
  chase: 'Chase',
  guess: 'Guessing',
  resuming: 'Resuming',
  'level-complete': 'Solved',
};

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function setText(element: Element, text: string): void {
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

/** `A _ _ _ E`: hidden positions read as underscores. */
function maskText(mask: readonly (string | null)[]): string {
  return mask.map((letter) => letter ?? '_').join(' ');
}

export function mountApp(): Game {
  const canvas = requireElement<HTMLCanvasElement>('#maze-canvas');
  const stage = requireElement<HTMLElement>('#stage');
  const pad = requireElement<HTMLElement>('#pad');
  const chaseControls = requireElement<HTMLElement>('#chase-controls');
  const guessPanel = requireElement<HTMLElement>('#guess-panel');
  const guessHeading = requireElement<HTMLElement>('#guess-heading');
  const letterGrid = requireElement<HTMLElement>('#letter-grid');
  const titleScreen = requireElement<HTMLElement>('#title-screen');
  const startButton = requireElement<HTMLButtonElement>('#start-button');
  const resultScreen = requireElement<HTMLElement>('#result-screen');
  const resultHeading = requireElement<HTMLElement>('#result-heading');
  const resultWord = requireElement<HTMLElement>('#result-word');
  const resultBonus = requireElement<HTMLElement>('#result-bonus');
  const resultScore = requireElement<HTMLElement>('#result-score');
  const playAgainButton = requireElement<HTMLButtonElement>('#play-again-button');
  const resultTitleButton = requireElement<HTMLButtonElement>('#result-title-button');
  const resumeOverlay = requireElement<HTMLElement>('#resume-overlay');
  const resumeMessage = requireElement<HTMLElement>('#resume-message');
  const resumeCount = requireElement<HTMLElement>('#resume-count');
  const scoreOutput = requireElement<HTMLElement>('#hud-score');
  const levelOutput = requireElement<HTMLElement>('#hud-level');
  const modeOutput = requireElement<HTMLElement>('#hud-mode');
  const categoryOutput = requireElement<HTMLElement>('#word-category');
  const maskOutput = requireElement<HTMLElement>('#word-mask');
  const feedbackOutput = requireElement<HTMLElement>('#word-feedback');
  const missesOutput = requireElement<HTMLElement>('#word-misses');

  // Fixture parameters take effect only in the test-only build (`npm run
  // build:fixture`). `__TEST_FIXTURES__` is a build-time constant, so an
  // ordinary production build drops this branch and the module with it: see
  // `src/app/fixture.ts`.
  const game = new Game(
    undefined,
    DEFAULT_CONFIG,
    __TEST_FIXTURES__ ? readTestFixture(window.location.search) : {},
  );
  const renderer = new MazeRenderer(canvas, game.maze);
  const loop = new FixedStepLoop({
    stepMs: DEFAULT_CONFIG.simulationStepMs,
    maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
    onStep: (stepSeconds) => game.step(stepSeconds),
  });

  const padButtons = [...pad.querySelectorAll<HTMLButtonElement>('[data-direction]')];

  // One real button per letter, built once and reused for the whole session.
  const letterButtons = new Map<string, HTMLButtonElement>();
  for (const letter of ALPHABET) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter';
    button.dataset.letter = letter;
    const character = document.createElement('span');
    character.textContent = letter;
    const mark = document.createElement('span');
    mark.className = 'letter__mark';
    mark.setAttribute('aria-hidden', 'true');
    button.append(character, mark);
    letterGrid.append(button);
    letterButtons.set(letter, button);
  }

  const resize = (): void => {
    renderer.resize(stage.clientWidth, stage.clientHeight, window.devicePixelRatio || 1);
  };

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(stage);
  }
  window.addEventListener('resize', resize);
  resize();

  const updateHud = (snapshot: GameSnapshot): void => {
    setText(scoreOutput, String(snapshot.score));
    setText(levelOutput, String(snapshot.level));
    setText(modeOutput, MODE_LABELS[snapshot.status]);
    setText(categoryOutput, snapshot.status === 'title' ? '—' : snapshot.word.category);
    setText(maskOutput, snapshot.status === 'title' ? '—' : maskText(snapshot.word.mask));
    setText(
      missesOutput,
      `Misses: ${snapshot.word.wrongLetters.length > 0 ? snapshot.word.wrongLetters.join(' ') : 'none'}`,
    );
  };

  /**
   * Reflects guessed state on the letter buttons. A guessed letter keeps its
   * place but is disabled and marked with a symbol as well as a colour, and
   * every letter is disabled outside guessing so a hidden panel holds nothing
   * focusable.
   */
  const updateLetters = (snapshot: GameSnapshot): void => {
    const guessing = snapshot.status === 'guess';
    const focused = document.activeElement;
    let focusedDisabled: string | null = null;

    for (const [letter, button] of letterButtons) {
      const hit = snapshot.word.revealedLetters.includes(letter);
      const miss = snapshot.word.wrongLetters.includes(letter);
      const state = hit ? 'hit' : miss ? 'miss' : '';
      if (button.dataset.state !== state) {
        button.dataset.state = state;
        const mark = button.querySelector('.letter__mark');
        if (mark) mark.textContent = hit ? '✓' : miss ? '✗' : '';
        button.setAttribute(
          'aria-label',
          hit ? `${letter}, in the word` : miss ? `${letter}, not in the word` : letter,
        );
      }
      const disabled = !guessing || hit || miss;
      if (button.disabled !== disabled) {
        button.disabled = disabled;
        if (disabled && focused === button) {
          focusedDisabled = letter;
        }
      }
    }

    // Focus must not be stranded on a button that just became unusable.
    if (guessing && focusedDisabled) {
      const order = [...letterButtons.keys()];
      const start = order.indexOf(focusedDisabled);
      for (let offset = 1; offset <= order.length; offset += 1) {
        const candidate = letterButtons.get(order[(start + offset) % order.length] as string);
        if (candidate && !candidate.disabled) {
          candidate.focus();
          return;
        }
      }
      guessHeading.focus();
    }
  };

  const describeGuess = (result: GuessResult, snapshot: GameSnapshot): string => {
    const letter = result.letter ?? '';
    switch (result.outcome) {
      case 'solved':
        return `${letter} completes the word: ${snapshot.word.answer ?? ''}.`;
      case 'correct':
        return `${letter} appears ${result.revealed === 1 ? 'once' : `${result.revealed} times`}. ${maskText(snapshot.word.mask)}`;
      case 'wrong':
        return `${letter} is not in the word. Catch the ball again.`;
      case 'duplicate':
        return `${letter} was already guessed.`;
      default:
        return '';
    }
  };

  /** Single entry point for a guess, whichever control produced it. */
  const applyGuess = (result: GuessResult): void => {
    if (result.outcome === 'ignored' || result.outcome === 'invalid') {
      return;
    }
    const snapshot = game.snapshot();
    setText(feedbackOutput, describeGuess(result, snapshot));
    if (result.outcome === 'wrong' && result.letter) {
      setText(resumeMessage, `${result.letter} is not in the word. Catch the ball again.`);
    }
    updateHud(snapshot);
    updateLetters(snapshot);
  };

  let shownStatus: GameStatus | null = null;

  /** Applies the one-time UI changes for a state, including where focus goes. */
  const applyStatus = (snapshot: GameSnapshot): void => {
    const status = snapshot.status;
    if (status === shownStatus) {
      return;
    }
    shownStatus = status;

    titleScreen.hidden = status !== 'title';
    resultScreen.hidden = status !== 'level-complete';
    guessPanel.hidden = status !== 'guess';
    chaseControls.hidden = status === 'guess';
    resumeOverlay.hidden = status !== 'resuming';
    for (const button of padButtons) {
      button.disabled = status !== 'chase';
    }
    updateLetters(snapshot);

    switch (status) {
      case 'guess':
        setText(feedbackOutput, 'Caught the ball. Choose a letter.');
        guessHeading.focus();
        break;
      case 'resuming':
        stage.focus(); // Focus leaves the panel before it is hidden.
        break;
      case 'level-complete':
        setText(resultWord, snapshot.word.answer ?? '');
        setText(resultBonus, String(DEFAULT_CONFIG.wordBonusScore));
        setText(resultScore, String(snapshot.score));
        resultHeading.focus();
        break;
      case 'title':
        setText(feedbackOutput, '');
        startButton.focus();
        break;
      default:
        break;
    }
  };

  const startRound = (): void => {
    game.startLevel();
    setText(feedbackOutput, '');
    const snapshot = game.snapshot();
    applyStatus(snapshot);
    updateHud(snapshot);
    resize();
    stage.focus();
  };

  startButton.addEventListener('click', startRound);
  playAgainButton.addEventListener('click', startRound);
  resultTitleButton.addEventListener('click', () => {
    game.returnToTitle();
    applyStatus(game.snapshot());
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return; // Browser and platform shortcuts stay with the browser.
    }
    const outcome = handleGameKey(game, event.key, { repeat: event.repeat });
    // Movement keys scroll the page, so the game suppresses their default even
    // when it ignores the auto-repeat. Letters scroll nothing.
    if (outcome.owned && outcome.kind === 'movement') {
      event.preventDefault();
    }
    if (outcome.guess) {
      applyGuess(outcome.guess);
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

  // Letters listen for `click` only, so a tap cannot guess twice, and a click
  // that lands after a mode change simply finds a disabled button.
  letterGrid.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest?.('[data-letter]');
    const letter = button?.getAttribute('data-letter');
    if (letter) {
      applyGuess(handleLetterButton(game, letter));
    }
  });

  const timing = new FrameTiming({
    isHidden: () => document.visibilityState === 'hidden',
    advance: (elapsedMs) => loop.advance(elapsedMs),
    drop: () => loop.reset(),
  });

  const dropHeldInput = (): void => {
    game.clearInput();
    timing.suspend();
  };

  window.addEventListener('blur', dropHeldInput);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      dropHeldInput();
    } else {
      // Returning rebases the frame clock, so the absence itself is not spent
      // on the countdown by the first visible frame.
      timing.suspend();
    }
  });

  const frame = (time: number): void => {
    timing.frame(time);
    const snapshot = game.snapshot();
    renderer.draw(game);
    applyStatus(snapshot);
    updateHud(snapshot);
    if (snapshot.status === 'resuming') {
      setText(resumeCount, String(Math.ceil(snapshot.resumeRemainingMs / 1000)));
    }
    window.requestAnimationFrame(frame);
  };

  const initial = game.snapshot();
  applyStatus(initial);
  updateHud(initial);
  startButton.focus();
  window.requestAnimationFrame(frame);

  window.__hacman = { getSnapshot: () => game.snapshot() };

  return game;
}
