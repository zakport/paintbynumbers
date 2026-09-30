import { generateTemplate } from './process';
import type { Settings } from './types';

self.onmessage = (event: MessageEvent<{ id: number; rgba: Uint8ClampedArray; width: number; height: number; settings: Settings }>) => {
  const { id, rgba, width, height, settings } = event.data;
  try {
    const result = generateTemplate(rgba, width, height, settings);
    self.postMessage({ id, result }, { transfer: [result.pixels.buffer, result.regionIds.buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Could not process image.' });
  }
};
