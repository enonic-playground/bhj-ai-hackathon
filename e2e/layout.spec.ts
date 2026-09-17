import { expect, test, type Page } from '@playwright/test';

const MAZE_COLUMNS = 21;
const MAZE_ROWS = 23;

async function boundingBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`No layout box for ${selector}`);
  return box;
}

async function canvasBottom(page: Page): Promise<number> {
  const box = await page.locator('#maze-canvas').boundingBox();
  return box ? box.y + box.height : Number.POSITIVE_INFINITY;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
});

test('layout fits the viewport with square tiles and usable controls', async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollX: window.scrollX,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const canvas = await boundingBox(page, '#maze-canvas');
  const pad = await boundingBox(page, '#pad');

  // Maze and directional pad are visible together, inside the viewport.
  expect(canvas.y).toBeGreaterThanOrEqual(0);
  expect(pad.y + pad.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(canvas.width).toBeGreaterThan(100);

  // Tiles stay square: the canvas keeps the maze's tile aspect ratio.
  const tileWidth = canvas.width / MAZE_COLUMNS;
  const tileHeight = canvas.height / MAZE_ROWS;
  expect(tileWidth).toBeCloseTo(tileHeight, 5);

  for (const direction of ['up', 'down', 'left', 'right']) {
    const button = await boundingBox(page, `[data-direction="${direction}"]`);
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }

  await testInfo.attach(`${testInfo.project.name}-chase.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.screenshot({ path: `docs/evidence/m1/${testInfo.project.name}-chase.png` });
});

test('title screen fits the viewport', async ({ page }, testInfo) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await page.screenshot({ path: `docs/evidence/m1/${testInfo.project.name}-title.png` });
});

test('the directional pad drives the same movement as the keyboard', async ({ page }, testInfo) => {
  const before = await page.evaluate(() => window.__hacman?.getSnapshot());
  expect(before?.score).toBe(0);

  // Touch devices exercise the real touch path; desktop uses a pointer click.
  const padLeft = page.locator('[data-direction="left"]');
  if (testInfo.project.use.hasTouch) {
    await padLeft.tap();
  } else {
    await padLeft.click();
  }
  await expect
    .poll(async () => (await page.evaluate(() => window.__hacman?.getSnapshot()))?.score ?? 0, {
      timeout: 5_000,
    })
    .toBeGreaterThan(0);

  const after = await page.evaluate(() => window.__hacman?.getSnapshot());
  expect(after?.player.direction).toBe('left');
  expect(after?.player.y).toBe(13);
  expect(after?.player.x).toBeLessThan(10);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('reducing the viewport height refits the maze without a reload', async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');

  // Play starts on a tall viewport, then the window is made shorter with no
  // reload: the canvas must shrink to the new height rather than keep the size
  // it was given while there was more room. R1, review round 1.
  const tall = { width: viewport.width, height: viewport.height + 240 };
  await page.setViewportSize(tall);
  await expect.poll(() => canvasBottom(page)).toBeLessThanOrEqual(tall.height + 1);

  await page.setViewportSize(viewport);

  await expect
    .poll(() => canvasBottom(page), { timeout: 5_000 })
    .toBeLessThanOrEqual(viewport.height + 1);

  const canvas = await boundingBox(page, '#maze-canvas');
  const pad = await boundingBox(page, '#pad');
  expect(canvas.y).toBeGreaterThanOrEqual(0);
  expect(pad.y + pad.height).toBeLessThanOrEqual(viewport.height + 1);

  // The page itself must fit too, rather than hiding the overflow.
  const document_ = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(document_.scrollHeight).toBeLessThanOrEqual(document_.clientHeight + 1);
  expect(document_.scrollWidth).toBeLessThanOrEqual(document_.clientWidth + 1);

  // Refitting keeps square tiles and usable controls.
  expect(canvas.width / MAZE_COLUMNS).toBeCloseTo(canvas.height / MAZE_ROWS, 5);
  expect(canvas.width).toBeGreaterThan(100);
  for (const direction of ['up', 'down', 'left', 'right']) {
    const button = await boundingBox(page, `[data-direction="${direction}"]`);
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
  }

  await testInfo.attach(`${testInfo.project.name}-resized.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.screenshot({ path: `docs/evidence/m1/${testInfo.project.name}-resized.png` });
});
