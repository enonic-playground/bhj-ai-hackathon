import { DEFAULT_CONFIG } from '../game/config.js';
import { isDirection } from '../game/direction.js';
import { Game, type GameSnapshot, type GameStatus, type GuessResult } from '../game/game.js';
import { CAMPAIGN_LENGTH } from '../game/levels.js';
import { FixedStepLoop } from '../game/loop.js';
import { ALPHABET } from '../game/words.js';
import {
  handleGameKey,
  handleLetterButton,
  handlePadDirection,
  handlePauseKey,
} from '../input/inputRouter.js';
import { MazeRenderer } from '../render/renderer.js';
import { BestScoreStore, resolveLocalStorage } from './bestScore.js';
import { readTestFixture } from './fixture.js';
import { FrameTiming } from './frameTiming.js';
import { initPwa } from './pwa.js';
import { ReducedMotionWatcher } from './reducedMotion.js';

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
  paused: 'Paused',
  dying: 'Caught',
  'level-complete': 'Solved',
  'game-over': 'Game over',
  'campaign-complete': 'Campaign complete',
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

function livesText(lives: number): string {
  return `${lives}${lives > 0 ? ` ${'◆'.repeat(lives)}` : ''}`;
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
  const titleBestScoreOutput = requireElement<HTMLElement>('#title-best-score');
  const resultScreen = requireElement<HTMLElement>('#result-screen');
  const resultHeading = requireElement<HTMLElement>('#result-heading');
  const resultWord = requireElement<HTMLElement>('#result-word');
  const resultBonus = requireElement<HTMLElement>('#result-bonus');
  const resultScore = requireElement<HTMLElement>('#result-score');
  const resultLives = requireElement<HTMLElement>('#result-lives');
  const nextLevelButton = requireElement<HTMLButtonElement>('#next-level-button');
  const resultTitleButton = requireElement<HTMLButtonElement>('#result-title-button');
  const campaignCompleteScreen = requireElement<HTMLElement>('#campaign-complete-screen');
  const campaignCompleteHeading = requireElement<HTMLElement>('#campaign-complete-heading');
  const campaignCompleteWord = requireElement<HTMLElement>('#campaign-complete-word');
  const campaignCompleteScore = requireElement<HTMLElement>('#campaign-complete-score');
  const campaignCompleteBest = requireElement<HTMLElement>('#campaign-complete-best');
  const campaignCompleteReplayButton = requireElement<HTMLButtonElement>('#campaign-complete-replay-button');
  const campaignCompleteTitleButton = requireElement<HTMLButtonElement>('#campaign-complete-title-button');
  const pauseScreen = requireElement<HTMLElement>('#pause-screen');
  const pauseHeading = requireElement<HTMLElement>('#pause-heading');
  const pauseReason = requireElement<HTMLElement>('#pause-reason');
  const pauseWord = requireElement<HTMLElement>('#pause-word');
  const pauseButton = requireElement<HTMLButtonElement>('#pause-button');
  const resumeButton = requireElement<HTMLButtonElement>('#resume-button');
  const pauseRestartButton = requireElement<HTMLButtonElement>('#pause-restart-button');
  const pauseTitleButton = requireElement<HTMLButtonElement>('#pause-title-button');
  const gameOverScreen = requireElement<HTMLElement>('#game-over-screen');
  const gameOverHeading = requireElement<HTMLElement>('#game-over-heading');
  const gameOverLevel = requireElement<HTMLElement>('#game-over-level');
  const gameOverWord = requireElement<HTMLElement>('#game-over-word');
  const gameOverScore = requireElement<HTMLElement>('#game-over-score');
  const gameOverBest = requireElement<HTMLElement>('#game-over-best');
  const gameOverRestartButton = requireElement<HTMLButtonElement>('#game-over-restart-button');
  const gameOverTitleButton = requireElement<HTMLButtonElement>('#game-over-title-button');
  const resumeOverlay = requireElement<HTMLElement>('#resume-overlay');
  const resumeMessage = requireElement<HTMLElement>('#resume-message');
  const resumeCount = requireElement<HTMLElement>('#resume-count');
  const dyingOverlay = requireElement<HTMLElement>('#dying-overlay');
  const dyingMessage = requireElement<HTMLElement>('#dying-message');
  const scoreOutput = requireElement<HTMLElement>('#hud-score');
  const livesOutput = requireElement<HTMLElement>('#hud-lives');
  const levelOutput = requireElement<HTMLElement>('#hud-level');
  const modeOutput = requireElement<HTMLElement>('#hud-mode');
  const shieldOutput = requireElement<HTMLElement>('#hud-shield');
  const extraLifeOutput = requireElement<HTMLElement>('#hud-extra-life');
  const categoryOutput = requireElement<HTMLElement>('#word-category');
  const maskOutput = requireElement<HTMLElement>('#word-mask');
  const feedbackOutput = requireElement<HTMLElement>('#word-feedback');
  const missesOutput = requireElement<HTMLElement>('#word-misses');
  const pwaOfflineStatus = requireElement<HTMLElement>('#pwa-offline-status');
  const pwaUpdateStatus = requireElement<HTMLElement>('#pwa-update-status');
  const pwaInstallButton = requireElement<HTMLButtonElement>('#pwa-install-button');
  const pwaInstallHelpText = requireElement<HTMLElement>('#pwa-install-help-text');

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
  const reducedMotion = new ReducedMotionWatcher(
    typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined,
    (value) => renderer.setReducedMotion(value),
  );
  renderer.setReducedMotion(reducedMotion.reducedMotion);
  const bestScore = new BestScoreStore(resolveLocalStorage());
  let lastRecordedScore = -1;
  let extraLifeAnnounced = false;
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
    setText(livesOutput, livesText(snapshot.lives));
    setText(levelOutput, `${snapshot.level}/${CAMPAIGN_LENGTH}`);
    setText(modeOutput, MODE_LABELS[snapshot.status]);
    setText(categoryOutput, snapshot.status === 'title' ? '—' : snapshot.word.category);
    setText(maskOutput, snapshot.status === 'title' ? '—' : maskText(snapshot.word.mask));
    setText(
      missesOutput,
      `Misses: ${snapshot.word.wrongLetters.length > 0 ? snapshot.word.wrongLetters.join(' ') : 'none'}`,
    );
    // Protection is announced in words as well as drawn as a ring on the maze.
    const shielded = snapshot.protectionRemainingMs > 0;
    shieldOutput.hidden = !shielded;
    if (shielded) {
      setText(shieldOutput, `Shielded for ${Math.ceil(snapshot.protectionRemainingMs / 1000)}s`);
    }
    // A static badge, present for the rest of the run once earned: no flash,
    // and the one-time announcement below carries the non-colour feedback.
    extraLifeOutput.hidden = !snapshot.extraLifeEarned;
    if (snapshot.extraLifeEarned && !extraLifeAnnounced) {
      extraLifeAnnounced = true;
      setText(feedbackOutput, `Extra life! You now have ${snapshot.lives} lives.`);
    }
    if (snapshot.score !== lastRecordedScore) {
      lastRecordedScore = snapshot.score;
      bestScore.record(snapshot.score);
    }
  };

  /**
   * Reflects guessed state on the letter buttons. A guessed letter keeps its
   * place but is disabled and marked with a symbol as well as a colour, and
   * every letter is disabled outside guessing — including while paused — so a
   * covered panel holds nothing focusable.
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

  const deathMessage = (lives: number): string =>
    lives > 0
      ? `Caught! ${lives} ${lives === 1 ? 'life' : 'lives'} remaining.`
      : 'Caught! No lives remaining.';

  /** Applies the one-time UI changes for a state, including where focus goes. */
  const applyStatus = (snapshot: GameSnapshot): void => {
    const status = snapshot.status;
    if (status === shownStatus) {
      return;
    }
    const previous = shownStatus;
    shownStatus = status;

    // While paused, the panel keeps showing whatever the pause interrupted, so
    // the frozen game stays legible behind the overlay. Nothing under the
    // overlay is operable: those controls are disabled by status, not by state.
    const beneath = status === 'paused' ? (snapshot.pausedFrom ?? 'chase') : status;

    titleScreen.hidden = status !== 'title';
    resultScreen.hidden = status !== 'level-complete';
    campaignCompleteScreen.hidden = status !== 'campaign-complete';
    gameOverScreen.hidden = status !== 'game-over';
    pauseScreen.hidden = status !== 'paused';
    guessPanel.hidden = beneath !== 'guess';
    chaseControls.hidden = beneath === 'guess';
    resumeOverlay.hidden = status !== 'resuming';
    dyingOverlay.hidden = status !== 'dying';
    pauseButton.disabled = !['chase', 'guess', 'resuming', 'dying'].includes(status);
    for (const button of padButtons) {
      button.disabled = status !== 'chase';
    }
    updateLetters(snapshot);

    switch (status) {
      case 'guess':
        // Resuming from a pause keeps the feedback the player was reading.
        if (previous !== 'paused') {
          setText(feedbackOutput, 'Caught the ball. Choose a letter.');
        }
        guessHeading.focus();
        break;
      case 'paused':
        setText(
          pauseReason,
          snapshot.pauseReason === 'away'
            ? 'Paused because the game lost focus. It will not resume by itself.'
            : 'The maze is frozen. Resume when you are ready.',
        );
        setText(pauseWord, maskText(snapshot.word.mask));
        pauseHeading.focus();
        break;
      case 'dying':
        setText(dyingMessage, deathMessage(snapshot.lives));
        setText(feedbackOutput, deathMessage(snapshot.lives));
        stage.focus();
        break;
      case 'resuming':
        stage.focus(); // Focus leaves the panel before it is hidden.
        break;
      case 'chase':
        stage.focus(); // Movement is keyboard-driven, so the play region owns focus.
        break;
      case 'level-complete':
        setText(resultWord, snapshot.word.answer ?? '');
        setText(resultBonus, String(DEFAULT_CONFIG.wordBonusScore));
        setText(resultScore, String(snapshot.score));
        setText(resultLives, livesText(snapshot.lives));
        resultHeading.focus();
        break;
      case 'campaign-complete':
        // Recorded here, not only in `updateHud`, so this run's final score is
        // already reflected the moment the panel that announces it appears.
        bestScore.record(snapshot.score);
        lastRecordedScore = snapshot.score;
        setText(campaignCompleteWord, snapshot.word.answer ?? '');
        setText(campaignCompleteScore, String(snapshot.score));
        setText(campaignCompleteBest, String(bestScore.best));
        campaignCompleteHeading.focus();
        break;
      case 'game-over':
        bestScore.record(snapshot.score);
        lastRecordedScore = snapshot.score;
        setText(gameOverLevel, String(snapshot.level));
        setText(gameOverWord, snapshot.word.answer ?? '');
        setText(gameOverScore, String(snapshot.score));
        setText(gameOverBest, String(bestScore.best));
        setText(feedbackOutput, `Game over. The word was ${snapshot.word.answer ?? ''}.`);
        gameOverHeading.focus();
        break;
      case 'title':
        setText(feedbackOutput, '');
        setText(titleBestScoreOutput, String(bestScore.best));
        startButton.focus();
        break;
      default:
        break;
    }
  };

  const refresh = (): void => {
    const snapshot = game.snapshot();
    applyStatus(snapshot);
    updateHud(snapshot);
  };

  const startRound = (): void => {
    game.startLevel();
    extraLifeAnnounced = false;
    setText(feedbackOutput, '');
    refresh();
    resize();
    stage.focus();
  };

  /** Next level: clears stale input and rebases frame timing before play, same as Resume. */
  const advanceLevel = (): void => {
    if (game.nextLevel()) {
      timing.suspend();
      setText(feedbackOutput, '');
      refresh();
      resize();
      stage.focus();
    }
  };

  const goToTitle = (): void => {
    game.returnToTitle();
    refresh();
  };

  const timing = new FrameTiming({
    isHidden: () => document.visibilityState === 'hidden',
    advance: (elapsedMs) => loop.advance(elapsedMs),
    drop: () => loop.reset(),
  });

  startButton.addEventListener('click', startRound);
  campaignCompleteReplayButton.addEventListener('click', startRound);
  pauseRestartButton.addEventListener('click', startRound);
  gameOverRestartButton.addEventListener('click', startRound);
  nextLevelButton.addEventListener('click', advanceLevel);
  resultTitleButton.addEventListener('click', goToTitle);
  campaignCompleteTitleButton.addEventListener('click', goToTitle);
  pauseTitleButton.addEventListener('click', goToTitle);
  gameOverTitleButton.addEventListener('click', goToTitle);

  pauseButton.addEventListener('click', () => {
    if (game.pause('manual')) {
      refresh();
    }
  });

  resumeButton.addEventListener('click', () => {
    if (game.resume()) {
      // The frame clock restarts here, so the paused interval is never replayed.
      timing.suspend();
      refresh();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return; // Browser and platform shortcuts stay with the browser.
    }
    if (handlePauseKey(game, event.key, { repeat: event.repeat })) {
      event.preventDefault();
      refresh();
      return;
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

  /**
   * Losing focus or visibility pauses an active state and never resumes it:
   * only the Resume control does that. A second event while already paused is
   * refused by the game, so the retained state survives repeated blur and
   * visibility changes.
   */
  const leaveGame = (): void => {
    game.clearInput();
    game.pause('away');
    timing.suspend();
    refresh();
  };

  window.addEventListener('blur', leaveGame);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      leaveGame();
    } else {
      // Returning rebases the frame clock, so the absence itself is not spent
      // on any timer by the first visible frame. The game stays paused.
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

  refresh();
  startButton.focus();
  window.requestAnimationFrame(frame);

  window.__hacman = { getSnapshot: () => game.snapshot() };

  // The service worker and its offline claims apply to ordinary production
  // output only: never the dev server, never the fixture build (D020).
  initPwa(
    {
      offlineStatus: pwaOfflineStatus,
      updateStatus: pwaUpdateStatus,
      installButton: pwaInstallButton,
      installHelpText: pwaInstallHelpText,
    },
    import.meta.env.PROD && !__TEST_FIXTURES__,
  );

  return game;
}
