# M1 evidence

Screenshots captured on 2026-09-17 against the production build (`npm run preview`) with
Playwright Chromium 153.0.8010.12 on macOS 24.6.0.

| File | Viewport | Content |
| --- | --- | --- |
| `desktop-title.png` | 1280 × 800 | Title screen with the Start action and instructions. |
| `desktop-chase.png` | 1280 × 800 | Fresh level one: maze left, hints and directional pad in the side panel. |
| `mobile-title.png` | 360 × 640 (emulated Pixel 5) | Title screen at the reference mobile viewport. |
| `mobile-chase.png` | 360 × 640 (emulated Pixel 5) | Fresh level one: HUD, maze, and pad visible together. |
| `mobile-play.png` | 360 × 640 (emulated Pixel 5) | Mid-play after the manual demonstration: score 260, dots cleared only along the travelled route. |
| `desktop-resized.png` | 1280 × 800, reached from 1280 × 1040 without a reload | R1 regression: the maze refits the shorter window instead of overflowing it. Byte-identical to `desktop-chase.png`, which is the point: resizing down lands on the same layout as a correct fresh load. |
| `mobile-resized.png` | 360 × 640, reached from 360 × 880 without a reload | R1 regression at the reference mobile viewport; likewise identical to `mobile-chase.png`. |

`desktop-*.png` and `mobile-title.png`/`mobile-chase.png`/`mobile-resized.png` are written by `e2e/layout.spec.ts`,
so `npm run test:e2e` refreshes them. `mobile-play.png` comes from the manual demonstration
described in `handoffs/M1.md`.

Mobile figures are browser emulation. Real-device checks belong to M5.
