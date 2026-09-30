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
  await page.getByRole('button', { name: 'Enlarge preview' }).click();
  await expect(page.getByRole('dialog', { name: 'Enlarged preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('dialog', { name: 'Enlarged preview' })).toContainText('2×');
  await page.getByRole('button', { name: 'Close enlarged preview' }).click();

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

test('region detail makes a visibly finer page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  const detail = page.getByRole('slider', { name: 'Region detail' });
  const busy = page.locator('.processing-overlay');
  await expect(page.locator('.region-badge')).toBeVisible();
  await expect(busy).toBeHidden();

  await detail.focus();
  await detail.press('Home');
  await expect(detail).toHaveValue('0');
  await expect(busy).toBeVisible();
  await expect(busy).toBeHidden();
  const lowRegions = Number((await page.locator('.region-badge').textContent())?.match(/(\d+) regions/)?.[1]);
  await page.getByRole('tab', { name: 'Color preview' }).click();
  const lowImage = await page.getByRole('img', { name: 'Estimated finished color result' }).getAttribute('src');

  await detail.press('End');
  await expect(detail).toHaveValue('100');
  await expect(busy).toBeVisible();
  await expect(busy).toBeHidden();
  const highRegions = Number((await page.locator('.region-badge').textContent())?.match(/(\d+) regions/)?.[1]);
  const highImage = await page.getByRole('img', { name: 'Estimated finished color result' }).getAttribute('src');
  const changedFraction = await page.evaluate(async ([low, high]) => {
    const read = async (url: string) => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = await read(low);
    const b = await read(high);
    let changed = 0;
    for (let at = 0; at < a.length; at += 4) {
      if (Math.max(Math.abs(a[at] - b[at]), Math.abs(a[at + 1] - b[at + 1]), Math.abs(a[at + 2] - b[at + 2])) > 10) changed++;
    }
    return changed / (a.length / 4);
  }, [lowImage!, highImage!] as [string, string]);

  expect(highRegions).toBeGreaterThan(lowRegions * 1.4);
  expect(changedFraction).toBeGreaterThan(0.03);
});
