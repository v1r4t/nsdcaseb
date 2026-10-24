import {
  test,
  expect,
  deleteRecruitmentApplication,
  deleteUserByEmail,
  registerObViaApi,
  uniqueEmail,
} from './fixtures';
import type { Page } from '@playwright/test';

// Admin recruitment flow through the real product paths:
//   register (API) -> verify (local D1) -> promote to ob (local D1) -> login (API)
//   -> /admin unlock -> Recruitment tab -> Select -> pending row gone
//   -> public status lookup says Selected -> CSV export contains the row.
// The applicant and the throwaway ob account are removed via local D1 at the
// end. Rate limits: one register + one login + one application per run.

const PASSWORD = 'E2eTest123456';
const WHY_JOIN =
  'I want to help the club run data workshops and learn from senior students.';
const CONTRIBUTE =
  'I can build small dashboards, take notes during sessions and help with logistics.';

function applicant(): { name: string; email: string; reg_number: string } {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return {
    name: `E2E Admin Recruit ${stamp}`,
    email: uniqueEmail('recruit-admin-applicant'),
    reg_number: `E2E-R-${stamp}`,
  };
}

function lookupForm(page: Page) {
  return page.locator('form').filter({ has: page.getByRole('button', { name: 'Check status' }) });
}

test('admin recruitment: pending -> Select -> Selected + CSV', async ({ page }) => {
  const adminEmail = uniqueEmail('recruit-ob');
  const input = applicant();

  try {
    // Office bearer through the real API; only the role flip is local D1.
    await registerObViaApi(page.request, {
      name: 'E2E Recruit Admin',
      email: adminEmail,
      mobile: '+911234567892',
      password: PASSWORD,
    });

    // One real application to decide on.
    const submitted = await page.request.post('/api/recruit', {
      data: {
        name: input.name,
        email: input.email,
        reg_number: input.reg_number,
        phone: '+919876543210',
        year: '3',
        branch: 'Computer Science',
        why_join: WHY_JOIN,
        contribute: CONTRIBUTE,
        time_commitment: '5 hours a week',
        remarks: 'E2E admin decision flow',
      },
    });
    expect(submitted.status(), await submitted.text()).toBe(201);

    // /admin is the disguised 404 until the zero-button unlocks it.
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Open admin console' }).click();
    await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();

    await page.getByRole('tab', { name: 'Recruitment' }).click();
    const panel = page.getByRole('region', { name: 'Recruitment' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Download CSV' })).toBeVisible();

    const table = panel.getByRole('table');
    const row = table.getByRole('row').filter({ hasText: input.name });
    await expect(row).toBeVisible();
    await expect(row.getByText('pending', { exact: true })).toBeVisible();

    // Decisions are final: the UI asks for confirmation first.
    let dialogText = '';
    page.once('dialog', (dialog) => {
      dialogText = dialog.message();
      void dialog.accept();
    });
    await row.getByRole('button', { name: 'Select' }).click();
    expect(dialogText).toContain(input.name);

    // The row leaves the pending bucket and shows up under selected.
    await expect(row.getByText('selected', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: /^pending \(/ }).click();
    await expect(table.getByText(input.name, { exact: true })).toHaveCount(0);

    await panel.getByRole('button', { name: /^selected \(/ }).click();
    await expect(table.getByText(input.name, { exact: true })).toBeVisible();

    // Public status lookup reflects the decision (contract shape included).
    const statusRes = await page.request.get(
      `/api/recruit/status?email=${encodeURIComponent(input.email)}&reg_number=${encodeURIComponent(input.reg_number)}`,
    );
    expect(statusRes.status()).toBe(200);
    const statusBody = (await statusRes.json()) as {
      application: { status: string; created_at: string; decided_at: string | null };
    };
    expect(statusBody.application.status).toBe('selected');
    expect(statusBody.application.decided_at).toBeTruthy();

    // ...and the page renders the same verdict.
    await page.goto('/recruit');
    const lookup = lookupForm(page);
    await lookup.getByLabel('College email').fill(input.email);
    await lookup.getByLabel('Register ID').fill(input.reg_number);
    await lookup.getByRole('button', { name: 'Check status' }).click();
    await expect(page.getByText('Selected', { exact: true })).toBeVisible();
    await expect(page.getByText(/You have been selected/)).toBeVisible();

    // CSV export is server-rendered and honours the status filter.
    const csvRes = await page.request.get('/api/admin/recruitment.csv?status=selected');
    expect(csvRes.status()).toBe(200);
    expect(csvRes.headers()['content-type']).toContain('text/csv');
    expect(csvRes.headers()['content-disposition']).toContain('recruitment.csv');
    const csv = await csvRes.text();
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      'id,name,email,reg_number,phone,year,branch,why_join,contribute,time_commitment,remarks,status,created_at,decided_at',
    );
    expect(lines.some((line) => line.includes(input.email) && line.includes(',selected,'))).toBe(
      true,
    );
  } finally {
    // Remove the decision + application and the throwaway ob account.
    await deleteRecruitmentApplication(input.email);
    await deleteUserByEmail(adminEmail);
  }
});
