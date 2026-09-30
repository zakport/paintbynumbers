import { generateTemplate } from './process';
import type { FocusCircle, Settings } from './types';

self.onmessage = (event: MessageEvent<{ id: number; rgba: Uint8ClampedArray; width: number; height: number; settings: Settings; circles: FocusCircle[] }>) => {
  const { id, rgba, width, height, settings, circles } = event.data;
  try {
    const result = generateTemplate(rgba, width, height, settings, circles);
    self.postMessage({ id, result }, { transfer: [result.pixels.buffer, result.regionIds.buffer] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Could not process image.' });
  }
};
