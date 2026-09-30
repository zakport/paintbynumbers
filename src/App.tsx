import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react';
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, Crop, Download, Image as ImageIcon, LoaderCircle, RefreshCw, SlidersHorizontal, Sparkles, UploadCloud, X, ZoomIn, ZoomOut } from 'lucide-react';
import { downloadCanvas, downloadPdf, renderColorPreview, renderTemplate } from './render';
import type { Settings, TemplateResult } from './types';

interface CropRect { x: number; y: number; width: number; height: number }
interface SourceImage { image: HTMLImageElement; url: string; name: string; ownedUrl: boolean }
type View = 'template' | 'color' | 'original';

const DEFAULT_SETTINGS: Settings = { maxColors: 20, detail: 50, paperSize: 'a4' };
const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

function CropDialog({ source, initial, onClose, onApply }: { source: SourceImage; initial: CropRect; onClose: () => void; onApply: (crop: CropRect) => void }) {
  const [draft, setDraft] = useState<CropRect>(initial);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: string; x: number; y: number; crop: CropRect } | null>(null);
  const aspect = source.image.naturalWidth / source.image.naturalHeight;

  function begin(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const mode = target.dataset.handle ?? target.closest('[data-handle]')?.getAttribute('data-handle');
    if (!mode || !frame.current) return;
    frame.current.setPointerCapture(event.pointerId);
    drag.current = { mode, x: event.clientX, y: event.clientY, crop: draft };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !frame.current) return;
    const dx = (event.clientX - drag.current.x) / frame.current.clientWidth;
    const dy = (event.clientY - drag.current.y) / frame.current.clientHeight;
    const { crop, mode } = drag.current;
    if (mode === 'move') {
      setDraft({ ...crop, x: Math.max(0, Math.min(1 - crop.width, crop.x + dx)), y: Math.max(0, Math.min(1 - crop.height, crop.y + dy)) });
      return;
    }
    let left = crop.x;
    let top = crop.y;
    let right = crop.x + crop.width;
    let bottom = crop.y + crop.height;
    if (mode.includes('w')) left = Math.max(0, Math.min(right - 0.1, crop.x + dx));
    if (mode.includes('e')) right = Math.min(1, Math.max(left + 0.1, crop.x + crop.width + dx));
    if (mode.includes('n')) top = Math.max(0, Math.min(bottom - 0.1, crop.y + dy));
    if (mode.includes('s')) bottom = Math.min(1, Math.max(top + 0.1, crop.y + crop.height + dy));
    setDraft({ x: left, y: top, width: right - left, height: bottom - top });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="crop-dialog" role="dialog" aria-modal="true" aria-label="Crop photo">
        <div className="dialog-heading"><div><span className="eyebrow">FRAME YOUR PHOTO</span><h2>Choose what stays in.</h2></div><button className="icon-button" onClick={onClose} aria-label="Close crop dialog"><X size={20} /></button></div>
        <p className="dialog-copy">Drag the frame or pull its corners to focus on your subject.</p>
        <div className="crop-stage">
          <div className="crop-frame" ref={frame} style={{ aspectRatio: String(aspect), width: `min(100%, ${Math.round(450 * aspect)}px)` }} onPointerDown={begin} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
            <img src={source.url} alt="Photo being cropped" draggable={false} />
            <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${draft.x * 100}% ${draft.y * 100}%, ${draft.x * 100}% ${(draft.y + draft.height) * 100}%, ${(draft.x + draft.width) * 100}% ${(draft.y + draft.height) * 100}%, ${(draft.x + draft.width) * 100}% ${draft.y * 100}%, ${draft.x * 100}% ${draft.y * 100}%)` }} />
            <div className="crop-selection" data-handle="move" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }}>
              {['nw', 'ne', 'sw', 'se'].map((handle) => <span key={handle} className={`crop-handle crop-handle-${handle}`} data-handle={handle} />)}
            </div>
          </div>
        </div>
        <div className="dialog-actions"><button className="text-button" onClick={() => setDraft(FULL_CROP)}>Use full photo</button><div><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={() => onApply(draft)}>Apply crop <ArrowRight size={17} /></button></div></div>
      </section>
    </div>
  );
}

function Slider({ label, value, min, max, low, high, caption, onChange }: { label: string; value: number; min: number; max: number; low: string; high: string; caption: string; onChange: (value: number) => void }) {
  return <div className="slider-field"><div className="slider-heading"><label>{label}</label><span className="slider-value">{label === 'Maximum pencils' ? value : `${value}%`}</span></div><input aria-label={label} type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} /><div className="slider-ends"><span>{low}</span><span>{high}</span></div><p>{caption}</p></div>;
}

export default function App() {
  const [source, setSource] = useState<SourceImage | null>(null);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [cropOpen, setCropOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [result, setResult] = useState<TemplateResult | null>(null);
  const [templateUrl, setTemplateUrl] = useState<string | null>(null);
  const [colorUrl, setColorUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [view, setView] = useState<View>('template');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const zoomScroll = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<SourceImage | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => { if (sourceRef.current?.ownedUrl) URL.revokeObjectURL(sourceRef.current.url); }, []);
  useEffect(() => {
    if (!zoomOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setZoomOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [zoomOpen]);

  function openImage(url: string, name: string, ownedUrl: boolean) {
    const image = new Image();
    image.onload = () => {
      if (sourceRef.current?.ownedUrl) URL.revokeObjectURL(sourceRef.current.url);
      const next = { image, url, name, ownedUrl };
      sourceRef.current = next;
      setSource(next);
      setCrop(FULL_CROP);
      setView('template');
      setZoomOpen(false);
      setResult(null);
      setError(null);
      document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    image.onerror = () => { if (ownedUrl) URL.revokeObjectURL(url); setError('This image could not be opened. Try a JPG, PNG, or WebP file.'); };
    image.src = url;
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WebP image.'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('Choose an image smaller than 20 MB.'); return; }
    openImage(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''), true);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  }

  function changeSetting<Key extends keyof Settings>(key: Key, value: Settings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!source) return;
    const id = ++requestId.current;
    let worker: Worker | null = null;
    setProcessing(true);
    setError(null);
    const timer = window.setTimeout(() => {
      const naturalWidth = source.image.naturalWidth;
      const naturalHeight = source.image.naturalHeight;
      const croppedWidth = naturalWidth * crop.width;
      const croppedHeight = naturalHeight * crop.height;
      const workingLongEdge = 420 + settings.detail * 4;
      const scale = Math.min(1, workingLongEdge / Math.max(croppedWidth, croppedHeight));
      const width = Math.max(1, Math.round(croppedWidth * scale));
      const height = Math.max(1, Math.round(croppedHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { setError('Canvas is not available in this browser.'); setProcessing(false); return; }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source.image, crop.x * naturalWidth, crop.y * naturalHeight, croppedWidth, croppedHeight, 0, 0, width, height);
      setOriginalUrl(canvas.toDataURL('image/jpeg', 0.9));
      const rgba = ctx.getImageData(0, 0, width, height).data;
      worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ id: number; result?: TemplateResult; error?: string }>) => {
        if (event.data.id !== requestId.current) return;
        if (event.data.error || !event.data.result) {
          setError(event.data.error ?? 'Could not generate the template.');
          setProcessing(false);
          worker?.terminate();
          return;
        }
        try {
          const generated = event.data.result;
          setResult(generated);
          setTemplateUrl(renderTemplate(generated, 1450).toDataURL('image/png'));
          setColorUrl(renderColorPreview(generated, 1450).toDataURL('image/png'));
        } catch (renderError) {
          setError(renderError instanceof Error ? renderError.message : 'Could not render the template.');
        } finally {
          setProcessing(false);
          worker?.terminate();
        }
      };
      worker.onerror = () => { setError('Image processing failed. Try a smaller photo.'); setProcessing(false); worker?.terminate(); };
      worker.postMessage({ id, rgba, width, height, settings }, [rgba.buffer]);
    }, 420);
    return () => { window.clearTimeout(timer); worker?.terminate(); };
  }, [source, crop, settings]);

  async function downloadPng(which: 'template' | 'color') {
    if (!result) return;
    setDownloadOpen(false);
    try {
      const canvas = which === 'template' ? renderTemplate(result, 3200) : renderColorPreview(result, 3200);
      await downloadCanvas(canvas, `${source?.name ?? 'numbered-studio'}-${which}.png`);
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'Could not download PNG.'); }
  }

  async function downloadPrintable() {
    if (!result) return;
    setDownloadOpen(false);
    try { await downloadPdf(result, settings.paperSize, `${source?.name ?? 'numbered-studio'}-printable.pdf`); }
    catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'Could not create PDF.'); }
  }

  const displayedImage = view === 'template' ? templateUrl : view === 'color' ? colorUrl : originalUrl;
  useEffect(() => {
    if (!zoomOpen || !zoomScroll.current) return;
    const scroller = zoomScroll.current;
    scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
  }, [zoomOpen, zoomLevel]);

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href="#top" aria-label="Numbered Studio home"><span className="brand-mark"><span /><span /><span /><span /></span><span>numbered<span className="brand-dot">.</span><small>STUDIO</small></span></a><nav><a href="#how-it-works">How it works</a><a href="#studio">The studio</a></nav><a className="header-cta" href="#studio">Start creating <ArrowRight size={16} /></a></header>

    <main id="top">
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> MADE FOR COLOR LOVERS</span><h1>A favorite photo,<br /><em>one pencil</em> at a time.</h1><p>Turn the moments you love into a printable pencil-by-number page, thoughtfully matched to Prismacolor Premier pencils.</p><div className="hero-actions"><button className="button button-primary button-large" onClick={() => fileInput.current?.click()}>Choose a photo <ArrowRight size={18} /></button><button className="button button-outline button-large" onClick={() => openImage('/demo.svg', 'Milo the dog', false)}>Try a sample</button></div><div className="hero-footnote"><span><Check size={15} /> Free to use</span><span><Check size={15} /> Your photo stays on your device</span></div></div><div className="hero-art" aria-hidden="true"><div className="hero-image-frame"><img src="/demo.svg" alt="" /><span className="frame-caption">from photo to pencil page</span></div><div className="hero-palette"><span className="palette-topline">YOUR PENCIL KEY <Sparkles size={15} /></span><div className="palette-row"><i style={{ background: '#FADDB2' }} /> <b>01</b> <span>PC 997</span> Beige</div><div className="palette-row"><i style={{ background: '#9F5215' }} /> <b>02</b> <span>PC 943</span> Burnt Ochre</div><div className="palette-row"><i style={{ background: '#533D2E' }} /> <b>03</b> <span>PC 1099</span> Espresso</div></div><div className="hero-stamp">MAKE<br />SOMETHING<br />PERSONAL <span>✳</span></div></div></section>

      <section id="how-it-works" className="how-section"><span className="section-kicker">A LITTLE CREATIVE MAGIC</span><div className="how-grid"><div><span className="step-number">01</span><h3>Bring a photo</h3><p>Upload a portrait or pet photo, then crop it to the part you love.</p></div><div><span className="step-number">02</span><h3>Make it yours</h3><p>Choose how many pencils to use and how much detail to keep.</p></div><div><span className="step-number">03</span><h3>Print & color</h3><p>Download a numbered page, pencil key, and color reference.</p></div></div></section>

      <section id="studio" className="studio-section"><div className="studio-intro"><div><span className="eyebrow"><span className="eyebrow-line" /> YOUR CREATIVE SPACE</span><h2>Make your masterpiece.</h2></div><p>A few little choices make a page that feels just right to color.</p></div><div className="studio-grid"><aside className="control-panel"><div className="panel-heading"><div className="panel-heading-icon"><SlidersHorizontal size={20} /></div><div><span>THE STUDIO</span><h3>Set things up</h3></div></div><input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => { handleFile(event.target.files?.[0]); event.target.value = ''; }} />
        {!source ? <button className="upload-zone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}><span className="upload-icon"><UploadCloud size={27} /></span><strong>Drop your photo here</strong><span>or click to browse files</span><small>JPG, PNG, WebP · up to 20 MB</small></button> : <div className="uploaded-photo" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}><img src={source.url} alt="Uploaded" /><div><span>YOUR PHOTO</span><strong title={source.name}>{source.name}</strong><button onClick={() => setCropOpen(true)}><Crop size={14} /> Crop photo</button></div><button className="replace-button" onClick={() => fileInput.current?.click()} aria-label="Replace photo"><RefreshCw size={17} /></button></div>}
        <div className="control-divider" /><div className="control-title"><span className="control-number">01</span><div><h4>Color & detail</h4><p>Find the balance that feels right.</p></div></div>
        <Slider label="Maximum pencils" value={settings.maxColors} min={6} max={40} low="Simple" high="Rich color" caption="The most pencil colors your page can use." onChange={(value) => changeSetting('maxColors', value)} />
        <Slider label="Region detail" value={settings.detail} min={0} max={100} low="Larger areas" high="Fine detail" caption="For finer regions, raise this and Maximum pencils, then crop close to your subject." onChange={(value) => changeSetting('detail', value)} />
        <div className="control-divider" /><div className="control-title"><span className="control-number">02</span><div><h4>Paper size</h4><p>For a perfect fit when you print.</p></div></div><div className="paper-options"><button className={settings.paperSize === 'a4' ? 'selected' : ''} onClick={() => changeSetting('paperSize', 'a4')}><span>A4</span><small>210 × 297 mm</small></button><button className={settings.paperSize === 'letter' ? 'selected' : ''} onClick={() => changeSetting('paperSize', 'letter')}><span>US Letter</span><small>8.5 × 11 in</small></button></div>
        <div className="control-note"><Sparkles size={16} /><span>Every number maps to a real Prismacolor Premier pencil.</span></div>
      </aside>

      <div className="preview-panel"><div className="preview-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h3>{source ? 'Your design is taking shape.' : 'Your canvas is waiting.'}</h3></div>{result && <span className="region-badge">{result.pencils.length} pencils · {result.regions.filter((region) => region.pencilIndex >= 0).length} regions</span>}</div>
        <div className="preview-tabs" role="tablist" aria-label="Preview type"><button role="tab" aria-selected={view === 'template'} className={view === 'template' ? 'active' : ''} onClick={() => setView('template')}>Numbered page</button><button role="tab" aria-selected={view === 'color'} className={view === 'color' ? 'active' : ''} onClick={() => setView('color')}>Color preview</button><button role="tab" aria-selected={view === 'original'} className={view === 'original' ? 'active' : ''} onClick={() => setView('original')}>Original photo</button></div>
        <div className="preview-canvas">{displayedImage && <button className="preview-zoom-button" aria-label="Enlarge preview" onClick={() => { setZoomLevel(1); setZoomOpen(true); }}><ZoomIn size={16} /> Enlarge</button>}<div className="preview-paper">{displayedImage ? <img src={displayedImage} alt={view === 'template' ? 'Numbered pencil-by-number template' : view === 'color' ? 'Estimated finished color result' : 'Cropped original photo'} /> : <div className="empty-preview"><div className="empty-preview-art"><div className="empty-ring ring-one" /><div className="empty-ring ring-two" /><span>1</span><span>2</span><span>3</span></div><ImageIcon size={25} /><strong>Your next piece starts here</strong><p>Choose a photo or try our sample to see your numbered page.</p><button onClick={() => openImage('/demo.svg', 'Milo the dog', false)}>Explore with a sample <ArrowRight size={15} /></button></div>}</div>{processing && <div className="processing-overlay"><LoaderCircle className="spin" size={28} /><strong>Finding your pencil colors…</strong><span>Making the little details just right</span></div>}</div>
        {error && <div className="error-message" role="alert">{error}</div>}
        <div className="preview-footer"><div className="preview-tip"><span>✳</span><p>{result ? 'Your pencil swatches are digital estimates. Test colors on your paper for the closest match.' : 'Tip: clear, well-lit photos make the nicest pages.'}</p></div><div className="download-wrap"><button className="button button-primary" disabled={!result || processing} onClick={() => setDownloadOpen((open) => !open)}><Download size={17} /> Download <ChevronDown size={15} /></button>{downloadOpen && result && <div className="download-menu"><button onClick={downloadPrintable}><ArrowDownToLine size={17} /><span><strong>Printable PDF</strong><small>Numbered page + pencil key</small></span></button><button onClick={() => downloadPng('template')}><ArrowDownToLine size={17} /><span><strong>Numbered page PNG</strong><small>High resolution image</small></span></button><button onClick={() => downloadPng('color')}><ArrowDownToLine size={17} /><span><strong>Color preview PNG</strong><small>Estimated finished look</small></span></button></div>}</div></div>
      </div></div></section>
    </main>
    <footer className="site-footer"><a className="brand" href="#top"><span className="brand-mark"><span /><span /><span /><span /></span><span>numbered<span className="brand-dot">.</span><small>STUDIO</small></span></a><p>A little more color in the everyday.</p><span>Made for the joy of making.</span></footer>
    {zoomOpen && displayedImage && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setZoomOpen(false); }}><section className="zoom-dialog" role="dialog" aria-modal="true" aria-label="Enlarged preview"><div className="zoom-toolbar"><strong>{view === 'template' ? 'Numbered page' : view === 'color' ? 'Color preview' : 'Original photo'}</strong><div><button className="icon-button" aria-label="Zoom out" disabled={zoomLevel === 1} onClick={() => setZoomLevel((level) => Math.max(1, level - 1))}><ZoomOut size={19} /></button><span>{zoomLevel}×</span><button className="icon-button" aria-label="Zoom in" disabled={zoomLevel === 3} onClick={() => setZoomLevel((level) => Math.min(3, level + 1))}><ZoomIn size={19} /></button><button className="icon-button" aria-label="Close enlarged preview" onClick={() => setZoomOpen(false)}><X size={19} /></button></div></div><div className="zoom-image-scroll" ref={zoomScroll}><img src={displayedImage} alt={view === 'template' ? 'Enlarged numbered page' : view === 'color' ? 'Enlarged color preview' : 'Enlarged original photo'} style={{ width: `${zoomLevel * 100}%` }} /></div></section></div>}
    {cropOpen && source && <CropDialog source={source} initial={crop} onClose={() => setCropOpen(false)} onApply={(nextCrop) => { setCrop(nextCrop); setCropOpen(false); }} />}
  </div>;
}
