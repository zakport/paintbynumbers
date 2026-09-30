import { describe, expect, it } from 'vitest';
import { generateTemplate } from './process';
import type { Settings } from './types';

const settings: Settings = { maxColors: 8, detail: 50, paperSize: 'a4' };

function picture(width: number, height: number, colorAt: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [red, green, blue] = colorAt(x, y);
      const at = (y * width + x) * 4;
      rgba.set([red, green, blue, 255], at);
    }
  }
  return rgba;
}

describe('photo to pencil template', () => {
  it('leaves white paper blank and gives each colored area a pencil in the key', () => {
    const image = picture(90, 60, (x, y) => {
      if (y < 12) return [255, 255, 255];
      return x < 45 ? [205, 39, 44] : [26, 87, 165];
    });
    const result = generateTemplate(image, 90, 60, settings);

    expect(result.pixels[3 * 90 + 45]).toBe(-1);
    expect(result.pencils.length).toBeGreaterThanOrEqual(2);
    expect(result.pencils.length).toBeLessThanOrEqual(settings.maxColors);
    expect(result.regions.filter((region) => region.pencilIndex >= 0).length).toBeGreaterThanOrEqual(2);
    for (const region of result.regions) {
      if (region.pencilIndex < 0) continue;
      expect(result.pencils[region.pencilIndex]?.code).toMatch(/^PC \d+$/);
      expect(result.regionIds[region.y * result.width + region.x]).toBe(region.id);
    }
  });

  it('produces a blank page for an entirely white image', () => {
    const result = generateTemplate(picture(40, 30, () => [255, 255, 255]), 40, 30, settings);
    expect(result.pencils).toHaveLength(0);
    expect(result.pixels.every((pixel) => pixel === -1)).toBe(true);
  });

  it('keeps small facial features in a full-page photo at high detail', () => {
    const width = 460;
    const height = 820;
    const image = picture(width, height, (x, y) => {
      const stripe = Math.round(11 * Math.sin(x / 24 + y / 31));
      if (y > 520) return [60 + stripe, 83 + stripe, 103 + stripe];
      if (y > 265) {
        const wave = Math.round(15 * Math.sin(x / 19 + y / 23));
        if ((x - 336) ** 2 / 57 ** 2 + (y - 377) ** 2 / 58 ** 2 < 1) {
          if ((x - 318) ** 2 / 5 ** 2 + (y - 379) ** 2 / 3 ** 2 < 1) return [118, 72, 67];
          if ((x - 352) ** 2 / 5 ** 2 + (y - 379) ** 2 / 3 ** 2 < 1) return [118, 72, 67];
          if ((x - 337) ** 2 / 14 ** 2 + (y - 407) ** 2 / 3 ** 2 < 1) return [135, 80, 78];
          return [185 + Math.round((x - 336) / 11), 142 + Math.round((y - 377) / 15), 131];
        }
        return [178 + wave, 182 + wave, 186 + wave];
      }
      return [115 + stripe, 124 + stripe, 129 + stripe];
    });
    const result = generateTemplate(image, width, height, { ...settings, maxColors: 40, detail: 100 });
    const at = (x: number, y: number) => result.pixels[y * width + x];
    expect(at(318, 379)).not.toBe(at(336, 360));
    expect(at(352, 379)).not.toBe(at(336, 360));
    expect(at(337, 407)).not.toBe(at(336, 360));
  });

  it('preserves small regions inside a detail circle without changing equally small regions outside', () => {
    const width = 200;
    const height = 200;
    const image = picture(width, height, (x, y) => {
      const smallPatch = (center: number) => Math.abs(x - center) <= 2 && Math.abs(y - 100) <= 2;
      return smallPatch(60) || smallPatch(140) ? [25, 80, 170] : [205, 39, 44];
    });
    const coarse = generateTemplate(image, width, height, { ...settings, detail: 0 });
    const focused = generateTemplate(image, width, height, { ...settings, detail: 0 }, [{ x: 0.3, y: 0.5, radius: 0.15 }]);
    const at = (result: typeof coarse, x: number, y: number) => result.pixels[y * width + x];

    expect(at(coarse, 60, 100)).toBe(at(coarse, 50, 100));
    expect(at(focused, 60, 100)).not.toBe(at(focused, 50, 100));
    expect(at(focused, 140, 100)).toBe(at(focused, 130, 100));
    expect(focused.regions.length).toBeGreaterThan(coarse.regions.length);
  });
});
