import { describe, expect, it } from 'vitest';
import { labDistanceSquared, PENCIL_LABS, PENCILS } from './color';
import { generateTemplate } from './process';
import type { Settings } from './types';

const settings: Settings = { maxColors: 8, separation: 35, detail: 50, paperSize: 'a4' };

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

  it('uses only visibly separated pencil colors when separation is high', () => {
    const image = picture(120, 80, (x, y) => [80 + Math.floor(x * 1.3), 45 + Math.floor(y * 1.4), 90 + Math.floor((x + y) * 0.4)]);
    const result = generateTemplate(image, 120, 80, { ...settings, maxColors: 20, separation: 100 });
    const ids = result.pencils.map((pencil) => PENCILS.findIndex((entry) => entry.code === pencil.code));
    for (let first = 0; first < ids.length; first++) {
      for (let second = first + 1; second < ids.length; second++) {
        expect(Math.sqrt(labDistanceSquared(PENCIL_LABS[ids[first]], PENCIL_LABS[ids[second]]))).toBeGreaterThanOrEqual(26);
      }
    }
  });

  it('produces a blank page for an entirely white image', () => {
    const result = generateTemplate(picture(40, 30, () => [255, 255, 255]), 40, 30, settings);
    expect(result.pencils).toHaveLength(0);
    expect(result.pixels.every((pixel) => pixel === -1)).toBe(true);
  });
});
