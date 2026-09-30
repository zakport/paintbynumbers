import catalog from './prismacolor.json';
import type { Pencil } from './types';

export const PENCILS: Pencil[] = catalog
  .filter((pencil) => pencil.code !== 'PC 938')
  .map((pencil) => ({
    ...pencil,
    name: pencil.name.replace('Yellowed Orange', 'Yellow Orange'),
  }));

export type Lab = [number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function linearize(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function xyzPivot(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

export function rgbToLab(red: number, green: number, blue: number): Lab {
  const r = linearize(red);
  const g = linearize(green);
  const b = linearize(blue);
  const x = xyzPivot((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = xyzPivot((r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0);
  const z = xyzPivot((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function labDistanceSquared(a: Lab, b: Lab): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

export const PENCIL_LABS = PENCILS.map((pencil) => rgbToLab(...hexToRgb(pencil.hex)));

export function isPaperWhite(lab: Lab): boolean {
  return lab[0] > 96 && Math.hypot(lab[1], lab[2]) < 6;
}
