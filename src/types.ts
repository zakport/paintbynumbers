export type PaperSize = 'a4' | 'letter';

// Coordinates are relative to the cropped image; radius is relative to its shorter side.
export interface FocusCircle {
  x: number;
  y: number;
  radius: number;
}

export interface Pencil {
  name: string;
  code: string;
  hex: string;
}

export interface Settings {
  maxColors: number;
  detail: number;
  paperSize: PaperSize;
}

export interface Region {
  id: number;
  pencilIndex: number;
  area: number;
  x: number;
  y: number;
  radius: number;
}

export interface TemplateResult {
  width: number;
  height: number;
  pixels: Int16Array;
  regionIds: Int32Array;
  regions: Region[];
  pencils: Pencil[];
}
