export type PaperSize = 'a4' | 'letter';

export interface Pencil {
  name: string;
  code: string;
  hex: string;
}

export interface Settings {
  maxColors: number;
  separation: number;
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
