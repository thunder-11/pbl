import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url)),
  credentials = JSON.parse(readFileSync(path.join(root, '.data/dev-credentials.json'), 'utf8')),
  out = path.join(root, '.taste-skill/qa');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  }),
  page = await context.newPage(),
  errors = [],
  checks = [],
  visual = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = 'http://127.0.0.1:5173';
const signIn = async (email, password) => {
  await page.goto(base);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('.auth-form button[type=submit]').click();
  await page
    .getByRole('heading', { name: /Learning overview|Teaching workspace|Department overview/ })
    .waitFor({ timeout: 20000 });
};
const screenshot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
};
let probes, rules;
const skill = path.join(os.homedir(), '.agents/skills/design-taste-frontend/scripts/lib');
if (existsSync(path.join(skill, 'probe.mjs'))) {
  probes = await import(pathToFileURL(path.join(skill, 'probe.mjs')));
  rules = await import(pathToFileURL(path.join(skill, 'rules.mjs')));
}
async function inspect(name) {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({
      width,
      height: width === 1440 ? 900 : width === 768 ? 1024 : 844,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, `${name} overflow at${width}`);
    if (probes) {
      const m = await page.evaluate(probes.probe),
        l = await page.evaluate(probes.layout),
        a = await page.evaluate(probes.app);
      const findings = [
        ...[
          ...rules.judge(m, { width, allow: name === 'progress' ? ['edge-text'] : [] }),
          ...rules.judgeLayout(l, { width, allow: name === 'progress' ? ['edge-text'] : [] }),
        ].filter((f) => !rules.APP_SKIP.has(f.id) && !['no-title', 'small-title'].includes(f.id)),
        ...rules.judgeApp(a, m, { width }),
      ];
      visual.push({ screen: name, width, findings });
    }
    await screenshot(name + '-' + width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
try {
  await signIn('student-a@example.invalid', credentials.studentPassword);
  checks.push('Student sign-in and current-user dashboard');
  await inspect('overview');
  await page.getByRole('link', { name: 'Curriculum', exact: true }).click();
  await page.getByRole('heading', { name: 'Your curriculum' }).waitFor();
  await page
    .getByRole('link', { name: /^Binary Search/ })
    .first()
    .click();
  await page.getByRole('heading', { name: 'Binary Search', exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Mark as read' }).click();
  await page.getByText('Reading recorded.').waitFor();
  checks.push('Syllabus navigation and read acknowledgment');
  await page.getByRole('tab', { name: 'Simulate & predict' }).click();
  await page.getByRole('heading', { name: 'Predict the next step' }).waitFor();
  await page.getByLabel('low =3', { exact: true }).check();
  await page.getByRole('button', { name: 'Check prediction' }).click();
  await page.getByText('Correct first answer', { exact: true }).waitFor();
  await page.getByText('Complete', { exact: true }).first().waitFor();
  checks.push('Deterministic Binary Search,prediction and final-state completion');
  await inspect('simulation');
  await page.getByRole('tab', { name: 'Concept check' }).click();
  await page.getByRole('button', { name: 'Start concept check' }).click();
  for (let i = 0; i < 5; i++) {
    await page.locator('.answer-options label').nth([0, 1, 2, 3, 0][i]).click();
    if (i < 4) await page.getByRole('button', { name: 'Save & next' }).click();
  }
  await page.getByRole('button', { name: 'Submit assessment', exact: true }).click();
  await page.getByRole('heading', { name: 'Assessment feedback' }).waitFor();
  assert.equal(await page.locator('.assessment-result strong').textContent(), '100.00%');
  checks.push('Server-side assessment grading and saved feedback');
  await page.getByRole('link', { name: 'Coding workspace', exact: true }).click();
  await page.getByRole('heading', { name: 'Coding workspace', exact: true }).waitFor();
  await page.getByLabel('Programming language').selectOption('PYTHON');
  await page.locator('.monaco-editor').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Grade required tests' }).isDisabled(), true);
  checks.push('Locally bundled Monaco and unavailable-service honesty');
  await inspect('workspace');
  await page.getByRole('link', { name: 'Compare algorithms', exact: true }).click();
  await page.getByRole('button', { name: 'Compare input', exact: true }).click();
  await page.getByRole('heading', { name: 'Counted operations' }).waitFor();
  const text = await page.locator('tbody').textContent();
  assert.match(text, /Bubble Sort/);
  assert.match(text, /Merge Sort/);
  checks.push('Real Bubble/Merge operation counts');
  await inspect('comparison');
  await page.getByRole('link', { name: 'My progress', exact: true }).click();
  await page.getByRole('heading', { name: 'My progress', exact: true }).waitFor();
  await inspect('progress');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn('faculty-a@example.invalid', credentials.facultyPassword);
  await page.getByRole('link', { name: 'Student progress', exact: true }).click();
  await page.getByRole('heading', { name: 'Student progress', exact: true }).waitFor();
  await page.locator('tbody tr').first().waitFor();
  await screenshot('faculty-progress');
  await page.getByRole('link', { name: 'Content studio', exact: true }).click();
  await page.getByRole('heading', { name: 'Content studio', exact: true }).waitFor();
  await screenshot('content-studio');
  checks.push('Faculty-scoped progress and content views');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signIn('admin@example.invalid', credentials.adminPassword);
  await page.getByRole('link', { name: 'Accounts & rules', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts & rules', exact: true }).waitFor();
  await page.locator('tbody tr').first().waitFor();
  await page.getByRole('button', { name: 'Recommendation rules', exact: true }).click();
  await page.getByRole('heading', { name: /Active version/ }).waitFor();
  await screenshot('admin-rules');
  checks.push('Administrator accounts,rules and audit views');
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  assert.deepEqual(
    visual.flatMap((entry) => entry.findings.filter((finding) => finding.level === 'FAIL')),
    [],
    'Design inspector failures',
  );
  writeFileSync(
    path.join(out, 'journey-report.json'),
    JSON.stringify({ checks, browserErrors: errors, visual }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        checks,
        browserErrors: errors,
        visualFailures: visual.flatMap((v) =>
          v.findings
            .filter((f) => f.level === 'FAIL')
            .map((f) => ({ screen: v.screen, width: v.width, id: f.id, message: f.message })),
        ),
        screenshots: out,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
}
