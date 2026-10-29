import { chromium } from '@playwright/test';
import fs from 'node:fs';
fs.mkdirSync('.taste-skill/redesign', { recursive: true });
const b = await chromium.launch({ channel: 'msedge', headless: true });
const p = await b.newPage();
const issues = [];
await p.goto('http://127.0.0.1:5173');
for (const w of [1440, 1024, 390]) {
  await p.setViewportSize({ width: w, height: 900 });
  await p.screenshot({
    path: `.taste-skill/redesign/login-${w}.png`,
    fullPage: true,
    mask: [p.locator('.demo-account dl')],
  });
  await p.getByRole('button', { name: 'Create student account', exact: true }).click();
  await p.screenshot({ path: `.taste-skill/redesign/register-${w}.png`, fullPage: true });
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
}
if (process.argv.includes('--auth-only')) {
  console.log('Checked sign in and registration at 1440, 1024 and 390px');
  await b.close();
  process.exit(0);
}
const c = JSON.parse(fs.readFileSync('.data/dev-credentials.json'));
await p.getByLabel('Email address').fill('student-a@example.invalid');
await p.getByLabel('Password', { exact: true }).fill(c.studentPassword);
await p.locator('button[type=submit]').click();
await p.waitForSelector('.metrics-strip');
for (const route of [
  '/',
  '/progress',
  '/curriculum',
  '/simulations',
  '/settings',
  '/workspace',
  '/compare',
]) {
  await p.goto('http://127.0.0.1:5173' + route);
  await p.waitForSelector('.page-heading');
  for (const w of [1440, 1024, 390]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({
      path: `.taste-skill/redesign/${route.replaceAll('/', '') || 'overview'}-${w}.png`,
      fullPage: true,
    });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) issues.push({ route, w, overflow });
  }
}
await b.close();
fs.writeFileSync('.taste-skill/redesign/results.json', JSON.stringify(issues, null, 2));
console.log(JSON.stringify(issues));
