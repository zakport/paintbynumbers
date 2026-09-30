import { isPaperWhite, labDistanceSquared, PENCIL_LABS, PENCILS, rgbToLab, type Lab } from './color';
import type { FocusCircle, Region, Settings, TemplateResult } from './types';

interface Component extends Region {
  members: number[];
}

const NEIGHBORS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

function components(pixels: Int16Array, width: number, height: number): { ids: Int32Array; items: Component[] } {
  const ids = new Int32Array(pixels.length).fill(-1);
  const queue = new Int32Array(pixels.length);
  const items: Component[] = [];
  for (let start = 0; start < pixels.length; start++) {
    if (ids[start] !== -1) continue;
    const id = items.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    ids[start] = id;
    const members: number[] = [];
    while (head < tail) {
      const at = queue[head++];
      members.push(at);
      const x = at % width;
      const y = Math.floor(at / width);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (ids[next] === -1 && pixels[next] === pixels[start]) {
          ids[next] = id;
          queue[tail++] = next;
        }
      }
    }
    items.push({ id, pencilIndex: pixels[start], area: members.length, x: start % width, y: Math.floor(start / width), radius: 0, members });
  }
  return { ids, items };
}

function findLabelCenters(items: Component[], ids: Int32Array, width: number, height: number): void {
  const distance = new Uint16Array(ids.length);
  distance.fill(65535);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const id = ids[at];
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || ids[at - 1] !== id || ids[at + 1] !== id || ids[at - width] !== id || ids[at + width] !== id) {
        distance[at] = 0;
      } else {
        distance[at] = Math.min(distance[at - 1], distance[at - width]) + 1;
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const at = y * width + x;
      if (x < width - 1) distance[at] = Math.min(distance[at], distance[at + 1] + 1);
      if (y < height - 1) distance[at] = Math.min(distance[at], distance[at + width] + 1);
      const region = items[ids[at]];
      if (distance[at] > region.radius) {
        region.radius = distance[at];
        region.x = x;
        region.y = y;
      }
    }
  }
}

function focusMask(width: number, height: number, circles: FocusCircle[]): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (circles.length === 0) return mask;
  const shorter = Math.min(width, height);
  for (const circle of circles) {
    const cx = circle.x * width;
    const cy = circle.y * height;
    const radius = circle.radius * shorter;
    const radiusSquared = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(height, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(width, Math.ceil(cx + radius)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radiusSquared) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function smoothPixels(pixels: Int16Array, width: number, height: number, passes: number, focus: Uint8Array): Int16Array {
  let current = pixels;
  for (let pass = 0; pass < passes; pass++) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const at = y * width + x;
        if (focus[at]) continue;
        const votes = new Map<number, number>([[current[at], 3]]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const color = current[at + dy * width + dx];
            votes.set(color, (votes.get(color) ?? 0) + 1);
          }
        }
        let best = current[at];
        let bestVotes = votes.get(best)!;
        for (const [color, count] of votes) {
          if (count > bestVotes) { best = color; bestVotes = count; }
        }
        if (bestVotes >= 5) next[at] = best;
      }
    }
    current = next;
  }
  return current;
}

function choosePencils(samples: Lab[], weights: number[], settings: Settings): number[] {
  if (samples.length === 0) return [];
  const candidateCount = PENCILS.length;
  const distances = PENCIL_LABS.map((pencil) => Float32Array.from(samples, (sample) => labDistanceSquared(sample, pencil)));
  const bestDistances = new Float32Array(samples.length).fill(Infinity);
  const selected: number[] = [];
  let currentError = Infinity;
  const minDistance = 5;

  const targetColors = Math.max(3, Math.round(settings.maxColors * (0.35 + 0.65 * settings.detail / 100)));
  for (let round = 0; round < targetColors; round++) {
    let bestCandidate = -1;
    let nextError = Infinity;
    for (let candidate = 0; candidate < candidateCount; candidate++) {
      if (selected.includes(candidate)) continue;
      if (selected.some((chosen) => Math.sqrt(labDistanceSquared(PENCIL_LABS[candidate], PENCIL_LABS[chosen])) < minDistance)) continue;
      const candidateDistances = distances[candidate];
      let error = 0;
      for (let sample = 0; sample < samples.length; sample++) {
        error += weights[sample] * Math.min(bestDistances[sample], candidateDistances[sample]);
      }
      if (error < nextError) { nextError = error; bestCandidate = candidate; }
    }
    if (bestCandidate < 0 || (round > 0 && currentError - nextError <= 0)) break;
    selected.push(bestCandidate);
    currentError = nextError;
    const newDistances = distances[bestCandidate];
    for (let sample = 0; sample < samples.length; sample++) {
      bestDistances[sample] = Math.min(bestDistances[sample], newDistances[sample]);
    }
  }
  return selected.sort((a, b) => PENCIL_LABS[b][0] - PENCIL_LABS[a][0]);
}

function printedPixelsPerMillimeter(width: number, height: number, paperSize: Settings['paperSize']): number {
  const [pageWidth, pageHeight] = paperSize === 'a4' ? [210, 297] : [215.9, 279.4];
  const scale = Math.min((pageWidth - 24) / width, (pageHeight - 28) / height);
  return 1 / scale;
}

function mergeSmallRegions(pixels: Int16Array, width: number, height: number, settings: Settings, selected: number[], focus: Uint8Array): { pixels: Int16Array; regionIds: Int32Array; regions: Component[] } {
  const pxPerMm = printedPixelsPerMillimeter(width, height, settings.paperSize);
  const minArea = Math.max(10, Math.round((1.3 + (100 - settings.detail) * 0.065) ** 2 * pxPerMm ** 2));
  const minRadius = Math.max(2, Math.round((0.65 + (100 - settings.detail) * 0.007) * pxPerMm));
  let result = components(pixels, width, height);

  for (let pass = 0; pass < 18; pass++) {
    findLabelCenters(result.items, result.ids, width, height);
    let changed = false;
    for (const region of result.items) {
      const detailed = focus[region.y * width + region.x] === 1;
      const areaLimit = detailed ? Math.max(6, Math.round(minArea * 0.12)) : minArea;
      const radiusLimit = detailed ? Math.max(1, Math.round(minRadius * 0.35)) : minRadius;
      if (region.area >= areaLimit && region.radius >= radiusLimit) continue;
      const neighbors = new Map<number, number>();
      for (const at of region.members) {
        const x = at % width;
        const y = Math.floor(at / width);
        for (const [dx, dy] of NEIGHBORS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const color = pixels[ny * width + nx];
          if (color !== region.pencilIndex) neighbors.set(color, (neighbors.get(color) ?? 0) + 1);
        }
      }
      let replacement: number | undefined;
      let bestScore = -Infinity;
      for (const [color, sharedEdge] of neighbors) {
        const colorDifference = color < 0 || region.pencilIndex < 0 ? 18 : Math.sqrt(labDistanceSquared(PENCIL_LABS[selected[color]], PENCIL_LABS[selected[region.pencilIndex]]));
        const score = sharedEdge / (1 + colorDifference / 35);
        if (score > bestScore) { bestScore = score; replacement = color; }
      }
      if (replacement === undefined) continue;
      for (const at of region.members) pixels[at] = replacement;
      changed = true;
    }
    if (!changed) break;
    result = components(pixels, width, height);
  }
  result = components(pixels, width, height);
  findLabelCenters(result.items, result.ids, width, height);
  return { pixels, regionIds: result.ids, regions: result.items };
}

export function generateTemplate(rgba: Uint8ClampedArray, width: number, height: number, settings: Settings, circles: FocusCircle[] = []): TemplateResult {
  if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new Error('Invalid image data');
  const focus = focusMask(width, height, circles);
  const stride = Math.max(1, Math.floor(Math.sqrt(width * height / 7000)));
  const samples: Lab[] = [];
  const weights: number[] = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const at = (y * width + x) * 4;
      const alpha = rgba[at + 3] / 255;
      const lab = rgbToLab(rgba[at] * alpha + 255 * (1 - alpha), rgba[at + 1] * alpha + 255 * (1 - alpha), rgba[at + 2] * alpha + 255 * (1 - alpha));
      if (!isPaperWhite(lab)) {
        samples.push(lab);
        weights.push(focus[y * width + x] ? 8 : 1);
      }
    }
  }
  const selected = choosePencils(samples, weights, settings);
  let pixels: Int16Array = new Int16Array(width * height);
  for (let at = 0; at < pixels.length; at++) {
    const offset = at * 4;
    const alpha = rgba[offset + 3] / 255;
    const lab = rgbToLab(rgba[offset] * alpha + 255 * (1 - alpha), rgba[offset + 1] * alpha + 255 * (1 - alpha), rgba[offset + 2] * alpha + 255 * (1 - alpha));
    if (isPaperWhite(lab) || selected.length === 0) { pixels[at] = -1; continue; }
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < selected.length; index++) {
      const distance = labDistanceSquared(lab, PENCIL_LABS[selected[index]]);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    pixels[at] = best;
  }
  pixels = smoothPixels(pixels, width, height, Math.max(0, Math.round(3 - settings.detail * 0.03)), focus);
  const cleaned = mergeSmallRegions(pixels, width, height, settings, selected, focus);
  const used = new Set(cleaned.pixels);
  const kept = selected.filter((_, index) => used.has(index));
  const remap = new Map<number, number>();
  selected.forEach((pencil, index) => { if (used.has(index)) remap.set(index, kept.indexOf(pencil)); });
  for (let at = 0; at < cleaned.pixels.length; at++) {
    if (cleaned.pixels[at] >= 0) cleaned.pixels[at] = remap.get(cleaned.pixels[at])!;
  }
  const regions = cleaned.regions.map(({ members: _members, ...region }) => ({ ...region, pencilIndex: region.pencilIndex < 0 ? -1 : remap.get(region.pencilIndex)! }));
  return { width, height, pixels: cleaned.pixels, regionIds: cleaned.regionIds, regions, pencils: kept.map((index) => PENCILS[index]) };
}
