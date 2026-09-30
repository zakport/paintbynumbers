import { hexToRgb } from './color';
import type { PaperSize, TemplateResult } from './types';

interface Point { x: number; y: number }
interface Edge { start: Point; end: Point; used: boolean }

function simplifyLoop(points: Point[]): Point[] {
  let current = points;
  for (let pass = 0; pass < 3 && current.length > 5; pass++) {
    const next: Point[] = [];
    for (let index = 0; index < current.length; index++) {
      const previous = current[(index + current.length - 1) % current.length];
      const point = current[index];
      const following = current[(index + 1) % current.length];
      const dx = following.x - previous.x;
      const dy = following.y - previous.y;
      const length = Math.hypot(dx, dy);
      const distance = length === 0 ? 0 : Math.abs(dy * point.x - dx * point.y + following.x * previous.y - following.y * previous.x) / length;
      if (distance > 0.8 || index % 2 === pass % 2) next.push(point);
    }
    if (next.length < 4 || next.length === current.length) break;
    current = next;
  }
  return current;
}

function grey(value: number, light: number, dark: number): string {
  const shade = Math.round(light + (dark - light) * Math.max(0, Math.min(100, value)) / 100);
  return `rgb(${shade}, ${shade}, ${shade})`;
}

function drawSmoothOutlines(ctx: CanvasRenderingContext2D, result: TemplateResult, darkness: number, onColor = false): void {
  const { width, height, regionIds } = result;
  const edgeLists: Edge[][] = Array.from({ length: result.regions.length }, () => []);
  const addEdge = (id: number, sx: number, sy: number, ex: number, ey: number) => {
    edgeLists[id].push({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, used: false });
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const id = regionIds[at];
      if (y === 0 || regionIds[at - width] !== id) addEdge(id, x, y, x + 1, y);
      if (x === width - 1 || regionIds[at + 1] !== id) addEdge(id, x + 1, y, x + 1, y + 1);
      if (y === height - 1 || regionIds[at + width] !== id) addEdge(id, x + 1, y + 1, x, y + 1);
      if (x === 0 || regionIds[at - 1] !== id) addEdge(id, x, y + 1, x, y);
    }
  }
  ctx.strokeStyle = grey(darkness, 216, 90);
  ctx.lineWidth = 0.55;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const edges of edgeLists) {
    if (edges.length === 0) continue;
    const starts = new Map<number, number[]>();
    const key = (point: Point) => point.y * (width + 1) + point.x;
    edges.forEach((edge, index) => {
      const at = key(edge.start);
      const list = starts.get(at) ?? [];
      list.push(index);
      starts.set(at, list);
    });
    ctx.beginPath();
    for (let index = 0; index < edges.length; index++) {
      if (edges[index].used) continue;
      const points: Point[] = [];
      let nextIndex: number | undefined = index;
      while (nextIndex !== undefined && !edges[nextIndex].used) {
        const edge: Edge = edges[nextIndex];
        edge.used = true;
        points.push(edge.start);
        nextIndex = (starts.get(key(edge.end)) ?? []).find((candidate) => !edges[candidate].used);
      }
      if (points.length < 3) continue;
      const simplified = simplifyLoop(points);
      const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const first = midpoint(simplified[simplified.length - 1], simplified[0]);
      ctx.moveTo(first.x, first.y);
      for (let point = 0; point < simplified.length; point++) {
        const end = midpoint(simplified[point], simplified[(point + 1) % simplified.length]);
        ctx.quadraticCurveTo(simplified[point].x, simplified[point].y, end.x, end.y);
      }
      ctx.closePath();
    }
    if (onColor) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.strokeStyle = grey(darkness, 216, 90);
      ctx.lineWidth = 0.55;
    }
    ctx.stroke();
  }
}

function drawNumbers(ctx: CanvasRenderingContext2D, result: TemplateResult, darkness: number, onColor = false): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = grey(darkness, 188, 50);
  const fontSize = Math.max(5.5, Math.min(result.width, result.height) * 0.012);
  for (const region of result.regions) {
    if (region.pencilIndex < 0) continue;
    ctx.font = `600 ${Math.min(fontSize, Math.max(2.5, region.radius * 1.1))}px Arial, sans-serif`;
    if (onColor) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2.2;
      ctx.strokeText(String(region.pencilIndex + 1), region.x + 0.5, region.y + 0.5);
    }
    ctx.fillText(String(region.pencilIndex + 1), region.x + 0.5, region.y + 0.5);
  }
}

function makeCanvas(width: number, height: number, longEdge: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = longEdge / Math.max(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / width, canvas.height / height);
  return { canvas, ctx };
}

export function renderTemplate(result: TemplateResult, longEdge = 1600, darkness = 50): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(result.width, result.height, longEdge);
  drawSmoothOutlines(ctx, result, darkness);
  drawNumbers(ctx, result, darkness);
  return canvas;
}

export function renderColorPreview(result: TemplateResult, longEdge = 1600, darkness = 50, showAnnotations = true): HTMLCanvasElement {
  const low = document.createElement('canvas');
  low.width = result.width;
  low.height = result.height;
  const lowCtx = low.getContext('2d');
  if (!lowCtx) throw new Error('Canvas is not available in this browser.');
  const image = lowCtx.createImageData(result.width, result.height);
  const rgb = result.pencils.map((pencil) => hexToRgb(pencil.hex));
  for (let at = 0; at < result.pixels.length; at++) {
    const color = result.pixels[at] < 0 ? [255, 255, 255] : rgb[result.pixels[at]];
    image.data[at * 4] = color[0];
    image.data[at * 4 + 1] = color[1];
    image.data[at * 4 + 2] = color[2];
    image.data[at * 4 + 3] = 255;
  }
  lowCtx.putImageData(image, 0, 0);
  const { canvas } = makeCanvas(result.width, result.height, longEdge);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(low, 0, 0, canvas.width, canvas.height);
  if (showAnnotations) {
    ctx.scale(canvas.width / result.width, canvas.height / result.height);
    drawSmoothOutlines(ctx, result, darkness, true);
    drawNumbers(ctx, result, darkness, true);
  }
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Could not create PNG.')); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      resolve();
    }, 'image/png');
  });
}

export async function downloadPdf(result: TemplateResult, paperSize: PaperSize, filename: string, darkness = 50, showColorAnnotations = true): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const size = paperSize === 'a4' ? [210, 297] : [215.9, 279.4];
  const landscape = result.width > result.height * 1.15;
  const [pageWidth, pageHeight] = landscape ? [size[1], size[0]] : size;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: paperSize });
  doc.setProperties({ title: 'Numbered Studio pencil-by-number template', subject: 'Prismacolor Premier pencil guide' });
  doc.setTextColor(54, 66, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('NUMBERED STUDIO', 12, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${result.pencils.length} Prismacolor pencils · ${result.regions.filter((region) => region.pencilIndex >= 0).length} numbered regions`, pageWidth - 12, 10, { align: 'right' });
  const imageWidth = pageWidth - 24;
  const imageHeight = pageHeight - 29;
  const scale = Math.min(imageWidth / result.width, imageHeight / result.height);
  const drawWidth = result.width * scale;
  const drawHeight = result.height * scale;
  const template = renderTemplate(result, 3200, darkness);
  doc.addImage(template.toDataURL('image/png'), 'PNG', (pageWidth - drawWidth) / 2, 16 + (imageHeight - drawHeight) / 2, drawWidth, drawHeight, undefined, 'FAST');
  doc.setDrawColor(218, 221, 214);
  doc.rect((pageWidth - drawWidth) / 2, 16 + (imageHeight - drawHeight) / 2, drawWidth, drawHeight);

  doc.addPage(paperSize, 'portrait');
  const [keyWidth, keyHeight] = size;
  doc.setTextColor(37, 50, 43);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Your pencil key', 14, 19);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Each number on the template uses one Prismacolor Premier pencil.', 14, 26);
  const preview = renderColorPreview(result, 1500, darkness, showColorAnnotations);
  const previewScale = Math.min((keyWidth - 28) / result.width, 93 / result.height);
  const previewWidth = result.width * previewScale;
  const previewHeight = result.height * previewScale;
  const previewY = 31;
  doc.addImage(preview.toDataURL('image/png'), 'PNG', (keyWidth - previewWidth) / 2, previewY, previewWidth, previewHeight, undefined, 'FAST');
  const keyY = previewY + previewHeight + 10;
  const rows = Math.ceil((result.pencils.length + 1) / 2);
  const rowHeight = Math.min(7.3, (keyHeight - keyY - 17) / rows);
  doc.setFontSize(8.5);
  result.pencils.forEach((pencil, index) => {
    const column = index >= rows ? 1 : 0;
    const row = column ? index - rows : index;
    const x = 14 + column * (keyWidth / 2 - 4);
    const y = keyY + row * rowHeight;
    const [r, g, b] = hexToRgb(pencil.hex);
    doc.setFillColor(r, g, b);
    doc.setDrawColor(190, 190, 190);
    doc.rect(x, y - 3.8, 7, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 50, 45);
    doc.text(String(index + 1), x + 10, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${pencil.code}  ${pencil.name}`, x + 17, y, { maxWidth: keyWidth / 2 - 35 });
  });
  const footerY = keyHeight - 9;
  doc.setFontSize(8);
  doc.setTextColor(105, 113, 107);
  doc.text('White areas: leave the paper uncolored. Pencil swatches are digital estimates.', 14, footerY);
  doc.save(filename);
}
