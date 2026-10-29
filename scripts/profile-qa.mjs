import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('.taste-skill/profile', { recursive: true });
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
try {
  await p.goto('http://127.0.0.1:5173');
  const c = JSON.parse(fs.readFileSync('.data/dev-credentials.json'));
  await p.getByLabel('Email address').fill('student-a@example.invalid');
  await p.getByLabel('Password', { exact: true }).fill(c.studentPassword);
  await p.locator('button[type=submit]').click();
  await p.waitForSelector('.metrics-strip');
  await p.goto('http://127.0.0.1:5173/profile');
  await p.waitForSelector('.profile-identity');
  for (const width of [1440, 1024, 390]) {
    await p.setViewportSize({ width, height: 900 });
    await p.screenshot({ path: `.taste-skill/profile/profile-${width}.png`, fullPage: true });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `profile overflow ${width}`,
    );
    await p.getByRole('button', { name: 'Edit profile', exact: true }).click();
    await p.screenshot({ path: `.taste-skill/profile/edit-${width}.png`, fullPage: true });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `editor overflow ${width}`,
    );
    await p.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await p.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await p
    .getByLabel('Learning and career goals')
    .fill('Understand algorithmic complexity and build a final-year project.');
  await p.getByRole('button', { name: 'Save profile', exact: true }).click();
  await p.getByText('Profile saved.', { exact: true }).waitFor();
  await p.reload();
  await p
    .getByText('Understand algorithmic complexity and build a final-year project.', { exact: true })
    .waitFor();
  const download = p.waitForEvent('download');
  await p.getByRole('button', { name: 'Export profile', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'cerebro-student-profile.json');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: profile and editor at all three widths; save/reload persistence; export; no page errors.',
  );
} finally {
  await b.close();
}
