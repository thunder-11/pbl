import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const base = 'http://localhost:5173',
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const badge = () => page.locator('.simulation-toolbar .badge');
const pause = async () => {
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).waitFor();
};
try {
  await page.goto(base);
  const login = page.waitForResponse((response) => response.url().endsWith('/auth/login'));
  await page.getByRole('button', { name: 'Try as student', exact: true }).click();
  const token = (await (await login).json()).data.accessToken;
  const response = await page.request.get(`${base}/api/v1/curriculum?pageSize=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const nodes = (await response.json()).data;
  const bubble = nodes.find((node) => node.title === 'Bubble Sort' && node.availability?.simulate);
  const binary = nodes.find(
    (node) => node.title === 'Binary Search' && node.availability?.simulate,
  );
  const conceptOnly = nodes.find(
    (node) =>
      node.availability?.understand &&
      node.availability?.assess &&
      !node.availability?.simulate &&
      !node.availability?.code,
  );
  const empty = nodes.find(
    (node) => node.kind === 'TOPIC' && Object.values(node.availability).every((value) => !value),
  );
  assert.ok(bubble && binary && conceptOnly && empty);
  await page.goto(`${base}/topics/${bubble.id}?activity=simulate`);
  await page.waitForFunction(() =>
    /Step [1-9]/.test(document.querySelector('.simulation-toolbar .badge')?.textContent || ''),
  );
  await page.getByRole('button', { name: 'Skip checkpoint' }).click();
  await pause();
  const stopped = await badge().textContent();
  await page.waitForTimeout(1600);
  assert.equal(await badge().textContent(), stopped, 'Pause must stop automatic progression');
  await page.getByRole('button', { name: 'Reset simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.getByRole('button', { name: 'Next step', exact: true }).click();
  await page.locator('.array-cell.is-changed').first().waitFor();
  assert.ok(
    await page.evaluate(() =>
      [...document.querySelectorAll('.array-value')].some((cell) =>
        cell
          .getAnimations()
          .some((animation) =>
            animation.effect
              .getKeyframes()
              .some((frame) => frame.transform?.includes('translateX')),
          ),
      ),
    ),
    'Changed values must animate between their old and new positions',
  );
  await page.screenshot({ path: '.taste-skill/qa/animated-swap.png', fullPage: true });
  console.log('Automatic start/advance, pause, reset and actual swap movement passed');
  await page.goto(`${base}/topics/${binary.id}?activity=simulate`);
  await page.getByRole('heading', { name: 'Predict the next step' }).waitFor();
  const checkpoint = await badge().textContent();
  await page.waitForTimeout(1600);
  assert.equal(await badge().textContent(), checkpoint);
  await page.getByRole('button', { name: 'Skip checkpoint' }).click();
  await page.getByText('Simulation complete', { exact: true }).waitFor();
  console.log('Prediction checkpoint pauses and automatic continuation passed');
  await page.goto(`${base}/topics/${conceptOnly.id}?activity=simulate`);
  await page.getByRole('tab', { name: 'Understand', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab').count(), 2);
  assert.equal(await page.locator('.workflow-step').count(), 2);
  assert.equal(await page.getByRole('tab', { name: 'Simulate & predict' }).count(), 0);
  assert.equal(await page.getByRole('tab', { name: 'Implement', exact: true }).count(), 0);
  await page.goto(`${base}/topics/${empty.id}`);
  await page
    .getByText('Learning activities have not yet been published for this syllabus topic.')
    .waitFor();
  assert.equal(await page.getByRole('tab').count(), 0);
  console.log('Unavailable sections, workflow items and invalid deep links handled');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/topics/${bubble.id}?activity=simulate`);
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await pause();
  assert.equal(
    await page
      .locator('.array-value')
      .first()
      .evaluate((cell) => getComputedStyle(cell).animationName),
    'none',
  );
  assert.equal(
    await page.locator('.sheet').evaluate((sheet) => getComputedStyle(sheet).animationName),
    'none',
  );
  assert.deepEqual(errors, []);
  console.log('Reduced motion and browser error checks passed');
} catch (error) {
  await page.screenshot({ path: '.taste-skill/qa/motion-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
