import { deleteUserByEmail, registerObViaApi, test, expect, uniqueEmail } from './fixtures';

// The admin console is operated from many devices, but events are always
// Bengaluru-local. Pin the browser to UTC and prove the list still renders IST.
test.use({ timezoneId: 'UTC', locale: 'en-IN' });

test('admin event list shows IST even when the browser is in UTC', async ({
  page,
  plainOpenEvent,
}) => {
  const adminEmail = uniqueEmail('admin-tz-ob');
  await registerObViaApi(page.request, {
    name: 'E2E Admin Timezone',
    email: adminEmail,
    mobile: '9876543210',
    password: 'E2ePassw0rd!',
  });

  try {
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Open admin console' }).click();
    await page.getByRole('tab', { name: 'Events' }).click();

    const events = page.getByRole('region', { name: 'Events' });
    await expect(events).toBeVisible();

    // Seeded event starts at 2030-06-01T10:00Z -> 15:30 IST.
    const row = events.locator('li').filter({ hasText: plainOpenEvent.title });
    await expect(row).toContainText('01 JUN 2030, 15:30 IST');

    // The edit form must also present IST wall time, not the UTC clock.
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(events.getByLabel('Event starts')).toHaveValue('2030-06-01T15:30');
    await expect(events.getByLabel('Event ends')).toHaveValue('2030-06-01T17:30');
  } finally {
    await deleteUserByEmail(adminEmail);
  }
});
