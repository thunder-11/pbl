import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures = [];
fs.mkdirSync('.taste-skill/login-editorial', { recursive: true });
try {
  const context = await browser.newContext();
  const p = await context.newPage();
  p.on('pageerror', (e) => failures.push(e.message));
  await p.goto('http://127.0.0.1:5173');
  await p.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  await p.getByRole('button', { name: 'Try as student' }).waitFor();
  assert.equal(await p.locator('.auth-story .algorithm-trace').count(), 0);
  for (const width of [1440, 1024, 390]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(200);
    await p.screenshot({
      path: `.taste-skill/login-editorial/sign-in-${width}.png`,
      fullPage: true,
    });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await p.getByRole('button', { name: 'Create student account', exact: true }).click();
    await p.screenshot({
      path: `.taste-skill/login-editorial/register-${width}.png`,
      fullPage: true,
    });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await p.getByLabel('Password', { exact: true }).fill('test-password');
  await p.getByRole('button', { name: 'Show password' }).click();
  await expect(p.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await p.getByRole('button', { name: 'Hide password' }).click();
  await expect(p.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await p.getByRole('button', { name: 'Create student account', exact: true }).click();
  const email = `profile-design-${Date.now()}@example.invalid`;
  const password = 'EditorialLoginTest2026';
  await p.getByLabel('Display name', { exact: true }).fill('Design verification');
  await p.getByLabel('Email address').fill(email);
  await p.getByLabel('Password', { exact: true }).fill(password);
  await p.getByRole('checkbox').first().check();
  await p.getByRole('button', { name: 'Create account', exact: true }).click();
  await p.getByText('Account created. Sign in to start learning.', { exact: true }).waitFor();
  await p.getByLabel('Email address').fill(email);
  await p.getByLabel('Password', { exact: true }).fill(password);
  await p.locator('.auth-form button[type=submit]').click();
  await p.getByRole('heading', { name: 'Learning overview', exact: true }).waitFor();
  await context.close();
  for (const [role, heading] of [
    ['student', 'Learning overview'],
    ['teacher', 'Teaching workspace'],
    ['admin', 'Department overview'],
  ]) {
    const c = await browser.newContext();
    const page = await c.newPage();
    page.on('pageerror', (e) => failures.push(e.message));
    await page.goto('http://127.0.0.1:5173');
    await page.getByRole('button', { name: `Try as ${role}` }).click();
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    await c.close();
  }
  assert.deepEqual(failures, []);
  console.log(
    'PASS: desktop/tablet/mobile, registration, actual password login, visibility toggle, all three demo roles, no page errors.',
  );
} finally {
  await browser.close();
}
