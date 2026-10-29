import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
fs.mkdirSync('.taste-skill/ambient', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('.auth-story').waitFor();
  const panel = page.locator('.auth-story');
  await page.mouse.move(1100, 100);
  await page.screenshot({
    path: '.taste-skill/ambient/static.png',
    mask: [page.locator('.demo-account dl')],
  });
  const bounds = await panel.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + 280);
  await page.waitForTimeout(600);
  const state = await panel.evaluate((el) => ({
    x: parseFloat(el.style.getPropertyValue('--ambient-x')),
    y: parseFloat(el.style.getPropertyValue('--ambient-y')),
    opacity: parseFloat(el.style.getPropertyValue('--ambient-opacity')),
    pointer: getComputedStyle(el, '::before').pointerEvents,
  }));
  assert.ok(Math.abs(state.x - bounds.width * 0.55) < 1);
  assert.ok(Math.abs(state.y - 280) < 1);
  assert.ok(state.opacity > 0.9);
  assert.equal(state.pointer, 'none');
  await page.screenshot({
    path: '.taste-skill/ambient/active.png',
    mask: [page.locator('.demo-account dl')],
  });
  assert.ok(
    Math.abs(
      await panel.evaluate((el) => parseFloat(el.style.getPropertyValue('--ambient-parallax-x'))),
    ) <= 2,
  );
  assert.equal(await page.locator('.auth-story .algorithm-trace').count(), 0);
  await page.mouse.move(1100, 100);
  await page.waitForTimeout(1100);
  assert.equal(
    await panel.evaluate((el) => el.style.getPropertyValue('--ambient-opacity')),
    '0.0000',
  );
  await page.getByRole('button', { name: 'Create student account', exact: true }).click();
  await expect(page.getByLabel('Display name', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(200, 200);
  assert.equal(await panel.evaluate((el) => getComputedStyle(el, '::before').display), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  const credentials = JSON.parse(fs.readFileSync('.data/dev-credentials.json', 'utf8'));
  await page.getByLabel('Email address').fill('student-a@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(credentials.studentPassword);
  await page.locator('.auth-form button[type=submit]').click();
  await page.waitForSelector('.metrics-strip');
  const demo = await context.newPage();
  await context.clearCookies();
  await demo.goto('http://127.0.0.1:5173');
  await demo.getByRole('button', { name: /Try as student/ }).click();
  await demo.waitForSelector('.metrics-strip');
  const touch = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const tp = await touch.newPage();
  await tp.goto('http://127.0.0.1:5173');
  await tp.locator('.auth-story').waitFor();
  await tp
    .locator('.auth-story')
    .dispatchEvent('pointermove', { pointerType: 'touch', clientX: 150, clientY: 150 });
  assert.equal(
    await tp.locator('.auth-story').evaluate((el) => getComputedStyle(el, '::before').display),
    'none',
  );
  await touch.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: panel-relative light, mouse leave, auth tabs, password sign-in, demo sign-in, reduced motion, touch, responsive overflow.',
  );
} finally {
  await browser.close();
}
