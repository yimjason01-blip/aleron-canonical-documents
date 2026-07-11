import { test, expect } from '@playwright/test';

const DEFAULT_URL = 'https://yimjason01-blip.github.io/aleron-canonical-documents/apps/physician/index.html?staging=1';
const dashboardURL = process.env.ALERON_PHYSICIAN_URL || DEFAULT_URL;
const physicianToken = process.env.ALERON_PHYSICIAN_TOKEN;
const patientId = process.env.ALERON_MEMBER_PATIENT_ID;

function required(name, value) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requireStagingTarget() {
  const url = new URL(dashboardURL);
  expect(url.protocol).toBe('https:');
  expect(url.hostname).toBe('yimjason01-blip.github.io');
  expect(url.pathname).toBe('/aleron-canonical-documents/apps/physician/index.html');
  expect(url.searchParams.get('staging')).toBe('1');
  expect(required('ALERON_MEMBER_PATIENT_ID', patientId)).toMatch(/^member_/);
  if (physicianToken) expect(physicianToken).toMatch(/^session\./);
}

async function waitForStatus(page, text) {
  await expect(page.locator('.status-line')).toContainText(text, { timeout: 30_000 });
}

test('real member physician review is released through deployed staging controls', async ({ page }) => {
  requireStagingTarget();

  const failedRequests = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(dashboardURL);
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: 10_000 });
  expect(failedRequests, `Dashboard boot had failed asset/API requests: ${failedRequests.join(', ')}`).toEqual([]);
  const login = page.locator('form[data-login-form]');
  if (await login.isVisible()) {
    required('ALERON_PHYSICIAN_TOKEN', physicianToken);
    await page.locator('input[name="token"]').fill(physicianToken);
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  const selector = page.locator('[data-case-selector]');
  await expect(selector).toBeVisible();
  await expect(selector.locator(`option[value="${patientId}"]`)).toHaveCount(1);
  await selector.selectOption(patientId);
  await expect(selector).toHaveValue(patientId);
  await expect(page.locator('.case-orientation')).toHaveAttribute('data-workflow-state', /.+/);

  await page.locator('[data-tab="vitality"]').click();
  await expect(page.locator('.vitality-card')).toHaveCount(1);
  await expect(page.locator('.vitality-triage')).toBeVisible();
  await expect(page.locator('.vitality-lever')).toContainText(/Dominant lever|Safety escalation|Triaged/);

  await page.locator('[data-tab="care-plan"]').click();
  const gate = page.locator('[data-analysis-gate]');
  await expect(gate).toContainText(/Review ready|Released · read only/);
  if (await gate.getByRole('button', { name: 'Start review' }).isEnabled()) {
    await gate.getByRole('button', { name: 'Start review' }).click();
    await waitForStatus(page, 'review started');
  }

  const requiredItem = page.locator('.plan-problem-group [data-plan-item]').first();
  await expect(requiredItem).toBeVisible();
  await requiredItem.click();
  const decision = page.locator('form[data-edit-item]');
  await expect(decision).toBeVisible();
  await decision.locator('select[name="action"]').selectOption('approve');
  await decision.locator('select[name="reason_code"]').selectOption('clinical_judgment_confirmed');
  await decision.locator('input[name="reason"]').fill('Staging E2E physician review approval.');
  await decision.getByRole('button', { name: 'Save decision' }).click();
  await waitForStatus(page, 'decision saved');

  await page.getByRole('button', { name: 'Generate release preview' }).click();
  await waitForStatus(page, 'preview generated');
  await expect(page.locator('[data-physician-attestation]')).toBeEnabled();
  await page.locator('[data-physician-attestation]').check();
  await page.getByRole('button', { name: 'Authorize release' }).click();
  await waitForStatus(page, 'authorization recorded');
  await expect(page.getByRole('button', { name: 'Release to patient' })).toBeEnabled();
  await page.getByRole('button', { name: 'Release to patient' }).click();

  await expect(page.locator('.release-closure')).toContainText('Released to patient', { timeout: 30_000 });
  await expect(page.locator('.release-closure')).toContainText('Patient visible · read only');
  await expect(page.locator('.error-line')).toHaveCount(0);
});
