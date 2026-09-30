import { expect, test } from '@playwright/test';
import { stat } from 'node:fs/promises';

test('sample image becomes a printable page and matching downloads', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.locator('.region-badge')).toContainText(/\d+ pencils · \d+ regions/);
  await expect(page.getByRole('img', { name: 'Numbered pencil-by-number template' })).toBeVisible();

  await page.getByRole('tab', { name: 'Color preview' }).click();
  await expect(page.getByRole('img', { name: 'Estimated finished color result' })).toBeVisible();

  await page.getByRole('button', { name: 'Crop photo' }).click();
  const originalCrop = await page.locator('.crop-selection').boundingBox();
  const corner = await page.locator('.crop-handle-se').boundingBox();
  if (!corner || !originalCrop) throw new Error('Crop corner is missing');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x - 70, corner.y - 50, { steps: 8 });
  await page.mouse.up();
  const smallerCrop = await page.locator('.crop-selection').boundingBox();
  expect(smallerCrop!.width).toBeLessThan(originalCrop.width - 30);
  await page.getByRole('button', { name: 'Apply crop' }).click();
  await expect(page.locator('.processing-overlay')).toBeVisible();
  await expect(page.locator('.processing-overlay')).toBeHidden();

  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Printable PDF/ }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/printable\.pdf$/);
  expect((await stat(await pdf.path())).size).toBeGreaterThan(20_000);

  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Numbered page PNG/ }).click()]);
  expect(png.suggestedFilename()).toMatch(/template\.png$/);
  expect((await stat(await png.path())).size).toBeGreaterThan(10_000);
  expect(pageErrors).toEqual([]);
});
