import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  addConnector,
  addInterface,
  addNote,
  addPart,
  createBlankDocument,
  createConnectorFromEndpoints,
  createStarterDocument,
  createValidatedDocument,
  deleteSelection,
  deserializeDocument,
  exportDocument,
  exportSavedDocument,
  getConnectorLabelPoint,
  getConnectorLabelRect,
  getDocumentBounds,
  getEntityDisplayName,
  getPartLabelRect,
  getRenderedInterfaceLabel,
  getRenderedBounds,
  isConnector,
  isInterface,
  isNote,
  isPart,
  isRectEntity,
  loadStoredDocument,
  persistDocument,
  recomputeDocument,
  resizeRectFromEdge,
  resolveConnectorArrowSize,
  resolveInterfaceFill,
  resolveInterfaceFontSize,
  resolvePartLabelFontSize,
  reverseConnectorDirection,
  validateDocument,
  wrapText,
} from "./model";
import type {
  ConnectorEntity,
  ConnectorCreationEndpoint,
  DocumentModel,
  InterfaceEntity,
  NoteEntity,
  PartEntity,
  Point,
  Side,
  ValidationIssue,
} from "./types";

type DragState =
  | { kind: "pan"; startClient: Point; originPan: Point }
  | {
      kind: "move-part";
      entityId: string;
      startWorld: Point;
      origin: Point;
      childOrigins: Record<string, Point>;
    }
  | { kind: "move-note"; entityId: string; startWorld: Point; origin: Point }
  | { kind: "move-interface"; entityId: string; startWorld: Point; origin: Point }
  | { kind: "move-label"; entityId: string; startWorld: Point; origin: Point }
  | {
      kind: "resize";
      entityId: string;
      entityType: "part" | "note";
      edge: Side;
      startWorld: Point;
      origin: { x: number; y: number; width: number; height: number };
    };

interface AppState {
  doc: DocumentModel;
  validation: ValidationIssue[];
  history: {
    past: DocumentModel[];
    future: DocumentModel[];
  };
  savedSnapshot: string;
}

interface InitialAppData {
  state: AppState;
  restoredFromStorage: boolean;
}

function createInitialAppData(): InitialAppData {
  const storedDocument = loadStoredDocument();
  const initialDocument = storedDocument ?? createStarterDocument();
  const initialState = createValidatedDocument(initialDocument);
  const initialSnapshot = exportDocument(initialState.doc);

  return {
    state: {
      doc: initialState.doc,
      validation: initialState.issues,
      history: {
        past: [],
        future: [],
      },
      savedSnapshot: initialSnapshot,
    },
    restoredFromStorage: Boolean(storedDocument),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatPoint(point: Point | null): string {
  if (!point) {
    return "--, --";
  }

  return `${Math.round(point.x)}, ${Math.round(point.y)}`;
}

function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function arrowHeadPoints(from: Point, to: Point, size: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  const wing = size * 0.48;

  return [
    `${to.x},${to.y}`,
    `${baseX + px * wing},${baseY + py * wing}`,
    `${baseX - px * wing},${baseY - py * wing}`,
  ].join(" ");
}

function getCanvasCenter(svg: SVGSVGElement | null): Point | null {
  if (!svg) {
    return null;
  }

  const rect = svg.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function screenToWorld(svg: SVGSVGElement | null, pan: Point, zoom: number, clientX: number, clientY: number): Point | null {
  if (!svg) {
    return null;
  }

  const rect = svg.getBoundingClientRect();
  return {
    x: (clientX - rect.left - pan.x) / zoom,
    y: (clientY - rect.top - pan.y) / zoom,
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildExportSvgMarkup(
  doc: DocumentModel,
  options: {
    bounds: { x: number; y: number; width: number; height: number };
    includeGrid: boolean;
  },
): string {
  const { bounds, includeGrid } = options;
  const defs = `
    <defs>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(71,85,105,0.12)" stroke-width="1" />
      </pattern>
      <pattern id="grid-major" width="120" height="120" patternUnits="userSpaceOnUse">
        <rect width="120" height="120" fill="url(#grid)" />
        <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(71,85,105,0.2)" stroke-width="1.5" />
      </pattern>
    </defs>
  `;

  const entitiesMarkup = doc.order
    .map((entityId) => {
      const entity = doc.entities[entityId];
      if (!entity || !entity.visible) {
        return "";
      }

      if (isPart(entity)) {
        const fontSize = resolvePartLabelFontSize(doc, entity);
        const labelRect = getPartLabelRect(doc, entity);
        return `
          <g data-entity-id="${entity.id}" data-entity-type="part">
            <rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.height}" rx="${entity.style.cornerRadius}" fill="${entity.style.fill}" stroke="${entity.style.stroke}" stroke-width="${entity.style.strokeWidth}" />
            <rect x="${labelRect.x - 8}" y="${labelRect.y - 6}" width="${labelRect.width + 16}" height="${labelRect.height}" rx="10" fill="rgba(255,255,255,0.82)" stroke="rgba(29,36,51,0.12)" />
            <text x="${labelRect.x}" y="${labelRect.y}" font-size="${fontSize}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-weight="700" fill="#111827" dominant-baseline="hanging">${escapeXml(entity.partId)}</text>
          </g>
        `;
      }

      if (isInterface(entity)) {
        const fontSize = resolveInterfaceFontSize(doc, entity);
        return `
          <g data-entity-id="${entity.id}" data-entity-type="interface">
            <rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.height}" rx="${entity.style.cornerRadius}" fill="${resolveInterfaceFill(doc, entity)}" stroke="${entity.style.stroke}" stroke-width="${entity.style.strokeWidth}" ${entity.snap.attachedToPartEdge ? "" : 'stroke-dasharray="8 4"'} />
            <text x="${entity.x + entity.width / 2}" y="${entity.y + entity.height / 2}" font-size="${fontSize}" font-family="${escapeXml(entity.textStyle.fontFamily)}" font-weight="${entity.textStyle.fontWeight}" fill="${entity.textStyle.fill}" text-anchor="middle" dominant-baseline="central">${escapeXml(getRenderedInterfaceLabel(doc, entity))}</text>
          </g>
        `;
      }

      if (isConnector(entity)) {
        const points = entity.routing.segments;
        if (points.length < 2) {
          return "";
        }
        const arrowSize = resolveConnectorArrowSize(doc, entity);
        const labelPoint = getConnectorLabelPoint(entity);
        const labelRect = getConnectorLabelRect(entity);
        return `
          <g data-entity-id="${entity.id}" data-entity-type="connector">
            <polyline fill="none" stroke="${entity.style.stroke}" stroke-width="${entity.style.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" />
            ${entity.direction.arrowHeadSide === "target" || entity.direction.arrowHeadSide === "both" ? `<polygon points="${arrowHeadPoints(points[points.length - 2]!, points[points.length - 1]!, arrowSize)}" fill="${entity.style.stroke}" />` : ""}
            ${entity.direction.arrowHeadSide === "source" || entity.direction.arrowHeadSide === "both" ? `<polygon points="${arrowHeadPoints(points[1]!, points[0]!, arrowSize)}" fill="${entity.style.stroke}" />` : ""}
            ${entity.content && labelPoint && labelRect ? `<g><rect x="${labelRect.x}" y="${labelRect.y}" width="${labelRect.width}" height="${labelRect.height}" rx="12" fill="rgba(255,255,255,0.94)" stroke="rgba(148,163,184,0.35)" /><text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" dominant-baseline="central" font-size="${entity.textStyle.fontSize}" font-family="${escapeXml(entity.textStyle.fontFamily)}" font-weight="${entity.textStyle.fontWeight}" fill="${entity.textStyle.fill}">${escapeXml(entity.content)}</text></g>` : ""}
          </g>
        `;
      }

      const lines = wrapText(entity.text, {
        maxWidth: Math.max(entity.width - 28, 90),
        fontFamily: entity.textStyle.fontFamily,
        fontSize: entity.textStyle.fontSize,
        fontWeight: entity.textStyle.fontWeight,
      });
      const lineHeight = entity.textStyle.fontSize * entity.textStyle.lineHeight;
      return `
        <g data-entity-id="${entity.id}" data-entity-type="note">
          <rect x="${entity.x}" y="${entity.y}" width="${entity.width}" height="${entity.height}" rx="${entity.style.cornerRadius}" fill="${entity.style.fill}" stroke="${entity.style.stroke}" stroke-width="${entity.style.strokeWidth}" />
          <text x="${entity.x + 16}" y="${entity.y + 18}" font-size="${entity.textStyle.fontSize}" font-family="${escapeXml(entity.textStyle.fontFamily)}" font-weight="${entity.textStyle.fontWeight}" fill="${entity.textStyle.fill}" dominant-baseline="hanging">${lines.map((line, index) => `<tspan x="${entity.x + 16}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("")}</text>
        </g>
      `;
    })
    .join("");

  const gridRect = includeGrid
    ? `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="url(#grid-major)" />`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, bounds.width)}" height="${Math.max(1, bounds.height)}" viewBox="${bounds.x} ${bounds.y} ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}">
  ${defs}
  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />
  ${gridRect}
  ${entitiesMarkup}
</svg>`;
}

async function downloadPngFromSvg(
  filename: string,
  svgMarkup: string,
  width: number,
  height: number,
): Promise<void> {
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Unable to create export canvas context."));
          return;
        }

        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error("Unable to create PNG export blob."));
            return;
          }

          const pngUrl = URL.createObjectURL(pngBlob);
          const link = document.createElement("a");
          link.href = pngUrl;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(pngUrl);
          resolve();
        }, "image/png");
      };
      image.onerror = () => reject(new Error("Unable to rasterize SVG export."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function CommitField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

function CommitTextInput({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (nextValue: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <CommitField label={label}>
      <input
        className="field__input"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </CommitField>
  );
}

function CommitTextArea({
  label,
  value,
  rows = 4,
  onCommit,
}: {
  label: string;
  value: string;
  rows?: number;
  onCommit: (nextValue: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <CommitField label={label}>
      <textarea
        className="field__textarea"
        rows={rows}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
      />
    </CommitField>
  );
}

function CommitNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (nextValue: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const nextValue = clamp(parsed, min ?? parsed, max ?? parsed);
    setDraft(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <CommitField label={label}>
      <input
        className="field__input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </CommitField>
  );
}

function NullableNumberInput({
  label,
  value,
  resolvedValue,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number | null;
  resolvedValue: number;
  min?: number;
  max?: number;
  onCommit: (nextValue: number | null) => void;
}) {
  const [draft, setDraft] = useState(String(value ?? resolvedValue));

  useEffect(() => {
    setDraft(String(value ?? resolvedValue));
  }, [value, resolvedValue]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value ?? resolvedValue));
      return;
    }

    const nextValue = clamp(parsed, min ?? parsed, max ?? parsed);
    setDraft(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <CommitField
      label={label}
      hint={value === null ? `Inheriting ${resolvedValue}` : undefined}
    >
      <div className="field__row">
        <input
          className="field__input"
          type="number"
          min={min}
          max={max}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <button className="ghost-button" type="button" onClick={() => onCommit(null)}>
          Inherit
        </button>
      </div>
    </CommitField>
  );
}

function CommitSelect({
  label,
  value,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  options: string[];
  onCommit: (nextValue: string) => void;
}) {
  return (
    <CommitField label={label}>
      <select className="field__input" value={value} onChange={(event) => onCommit(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </CommitField>
  );
}

function CommitColorInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (nextValue: string) => void;
}) {
  return (
    <CommitField label={label}>
      <div className="field__row">
        <input className="field__color" type="color" value={value} onChange={(event) => onCommit(event.target.value)} />
        <input className="field__input" value={value} onChange={(event) => onCommit(event.target.value)} />
      </div>
    </CommitField>
  );
}

function NullableColorInput({
  label,
  value,
  resolvedValue,
  onCommit,
}: {
  label: string;
  value: string | null;
  resolvedValue: string;
  onCommit: (nextValue: string | null) => void;
}) {
  const liveValue = value ?? resolvedValue;
  return (
    <CommitField label={label} hint={value === null ? `Inheriting ${resolvedValue}` : undefined}>
      <div className="field__row">
        <input className="field__color" type="color" value={liveValue} onChange={(event) => onCommit(event.target.value)} />
        <input className="field__input" value={liveValue} onChange={(event) => onCommit(event.target.value)} />
        <button className="ghost-button" type="button" onClick={() => onCommit(null)}>
          Inherit
        </button>
      </div>
    </CommitField>
  );
}

export default function App() {
  const initialAppDataRef = useRef<InitialAppData | null>(null);
  if (!initialAppDataRef.current) {
    initialAppDataRef.current = createInitialAppData();
  }

  const [state, setState] = useState<AppState>(initialAppDataRef.current.state);
  const [pan, setPan] = useState<Point>({ x: 120, y: 80 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [connectorSource, setConnectorSource] = useState<ConnectorCreationEndpoint | null>(null);
  const [showRestoreNotice, setShowRestoreNotice] = useState(initialAppDataRef.current.restoredFromStorage);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartDocRef = useRef<DocumentModel | null>(null);

  const doc = state.doc;
  const isDirty = exportDocument(doc) !== state.savedSnapshot;
  const selectedEntities = doc.ui.selection.map((entityId) => doc.entities[entityId]).filter(Boolean);
  const singleSelection = doc.ui.selection.length === 1 ? doc.entities[doc.ui.selection[0]!] : null;
  const validationErrors = state.validation.filter((issue) => issue.level === "error");
  const toolLabel =
    doc.ui.activeTool === "addConnector"
      ? connectorSource
        ? "Pick a target part or interface to finish the connector."
        : "Pick a source part or interface to begin the connector."
      : doc.ui.activeTool === "addInterface"
        ? "Pick a part for the new interface."
        : "Ready";

  function resetViewportAndTools() {
    setPan({ x: 120, y: 80 });
    setDragState(null);
    dragStartDocRef.current = null;
    setConnectorSource(null);
  }

  function replaceStateDocument(
    nextDoc: DocumentModel,
    options?: {
      clearHistory?: boolean;
      saved?: boolean;
      persist?: boolean;
    },
  ) {
    const normalized = structuredClone(nextDoc);
    recomputeDocument(normalized);
    const issues = validateDocument(normalized);
    if (options?.persist !== false) {
      persistDocument(normalized);
    }
    setState((previous) => ({
      doc: normalized,
      validation: issues,
      history: options?.clearHistory
        ? { past: [], future: [] }
        : { past: previous.history.past, future: [] },
      savedSnapshot: options?.saved ? exportDocument(normalized) : previous.savedSnapshot,
    }));
  }

  function commitDocument(
    mutator: (draft: DocumentModel) => void,
    options?: {
      persist?: boolean;
      history?: boolean;
      saved?: boolean;
    },
  ) {
    setState((previous) => {
      const nextDoc = structuredClone(previous.doc);
      mutator(nextDoc);
      recomputeDocument(nextDoc);
      const issues = validateDocument(nextDoc);
      if (options?.persist !== false) {
        persistDocument(nextDoc);
      }
      return {
        doc: nextDoc,
        validation: issues,
        history:
          options?.history === false
            ? previous.history
            : {
                past: [...previous.history.past, structuredClone(previous.doc)],
                future: [],
              },
        savedSnapshot: options?.saved ? exportDocument(nextDoc) : previous.savedSnapshot,
      };
    });
  }

  function previewDocument(mutator: (draft: DocumentModel) => void) {
    setState((previous) => {
      const nextDoc = structuredClone(previous.doc);
      mutator(nextDoc);
      recomputeDocument(nextDoc);
      return { ...previous, doc: nextDoc, validation: previous.validation };
    });
  }

  function updateUi(mutator: (ui: DocumentModel["ui"]) => void) {
    setState((previous) => {
      const nextDoc = structuredClone(previous.doc);
      mutator(nextDoc.ui);
      return { ...previous, doc: nextDoc, validation: previous.validation };
    });
  }

  function loadBlankDocument(options?: { confirmDiscard?: boolean; closeRestoreNotice?: boolean }) {
    if (options?.confirmDiscard && isDirty && !window.confirm("Discard the current unsaved diagram and start a new document?")) {
      return;
    }

    const next = createValidatedDocument(createBlankDocument());
    replaceStateDocument(next.doc, {
      clearHistory: true,
      saved: true,
    });
    resetViewportAndTools();
    if (options?.closeRestoreNotice ?? true) {
      setShowRestoreNotice(false);
    }
  }

  function loadStarterDocument(options?: { confirmReset?: boolean; closeRestoreNotice?: boolean }) {
    if (options?.confirmReset && !window.confirm("Reset the canvas back to the starter diagram?")) {
      return;
    }

    const next = createValidatedDocument(createStarterDocument());
    replaceStateDocument(next.doc, {
      clearHistory: true,
      saved: true,
    });
    resetViewportAndTools();
    if (options?.closeRestoreNotice ?? true) {
      setShowRestoreNotice(false);
    }
  }

  function setSelection(entityIds: string[], primarySelectionId?: string | null) {
    commitDocument(
      (draft) => {
        draft.ui.selection = entityIds;
        draft.ui.primarySelectionId = primarySelectionId ?? entityIds[entityIds.length - 1] ?? null;
        if (entityIds.length === 0) {
          draft.ui.activeTool = null;
        }
      },
      { persist: false, history: false },
    );
  }

  function clearSelection() {
    setConnectorSource(null);
    commitDocument(
      (draft) => {
        draft.ui.selection = [];
        draft.ui.primarySelectionId = null;
        draft.ui.activeTool = null;
      },
      { persist: false, history: false },
    );
  }

  function cancelTools() {
    setConnectorSource(null);
    commitDocument(
      (draft) => {
        draft.ui.activeTool = null;
      },
      { persist: false, history: false },
    );
  }

  function setTool(tool: DocumentModel["ui"]["activeTool"]) {
    setConnectorSource(null);
    commitDocument(
      (draft) => {
        draft.ui.activeTool = tool;
      },
      { persist: false, history: false },
    );
  }

  function markSaved() {
    setState((previous) => ({
      ...previous,
      savedSnapshot: exportDocument(previous.doc),
    }));
  }

  function fitView() {
    const svg = svgRef.current;
    const center = getCanvasCenter(svg);
    if (!svg || !center) {
      return;
    }

    const bounds = doc.ui.selection.length > 0 ? getRenderedBounds(doc, doc.ui.selection) : getDocumentBounds(doc);
    const rect = svg.getBoundingClientRect();
    const scaleX = (rect.width - 120) / Math.max(bounds.width, 1);
    const scaleY = (rect.height - 120) / Math.max(bounds.height, 1);
    const zoom = clamp(Math.min(scaleX, scaleY), 0.4, 1.8);
    const nextPan = {
      x: center.x - (bounds.x + bounds.width / 2) * zoom,
      y: center.y - (bounds.y + bounds.height / 2) * zoom,
    };

    setPan(nextPan);
    commitDocument(
      (draft) => {
        draft.ui.zoom = zoom;
      },
      { persist: false, history: false },
    );
  }

  function centerBounds(bounds: Point & { width: number; height: number }) {
    const svg = svgRef.current;
    const center = getCanvasCenter(svg);
    if (!center) {
      return;
    }

    setPan({
      x: center.x - (bounds.x + bounds.width / 2) * doc.ui.zoom,
      y: center.y - (bounds.y + bounds.height / 2) * doc.ui.zoom,
    });
  }

  function centerSelection() {
    if (doc.ui.selection.length === 0) {
      return;
    }

    centerBounds(getRenderedBounds(doc, doc.ui.selection));
  }

  function zoomAt(screenPoint: Point, factor: number) {
    const nextZoom = clamp(doc.ui.zoom * factor, 0.4, 2.4);
    const worldX = (screenPoint.x - pan.x) / doc.ui.zoom;
    const worldY = (screenPoint.y - pan.y) / doc.ui.zoom;
    setPan({
      x: screenPoint.x - worldX * nextZoom,
      y: screenPoint.y - worldY * nextZoom,
    });
    commitDocument(
      (draft) => {
        draft.ui.zoom = nextZoom;
      },
      { persist: false, history: false },
    );
  }

  function undo() {
    setState((previous) => {
      if (previous.history.past.length === 0) {
        return previous;
      }

      const nextDoc = structuredClone(previous.history.past[previous.history.past.length - 1]!);
      recomputeDocument(nextDoc);
      const issues = validateDocument(nextDoc);
      persistDocument(nextDoc);

      return {
        ...previous,
        doc: nextDoc,
        validation: issues,
        history: {
          past: previous.history.past.slice(0, -1),
          future: [structuredClone(previous.doc), ...previous.history.future],
        },
      };
    });
  }

  function redo() {
    setState((previous) => {
      if (previous.history.future.length === 0) {
        return previous;
      }

      const nextDoc = structuredClone(previous.history.future[0]!);
      recomputeDocument(nextDoc);
      const issues = validateDocument(nextDoc);
      persistDocument(nextDoc);

      return {
        ...previous,
        doc: nextDoc,
        validation: issues,
        history: {
          past: [...previous.history.past, structuredClone(previous.doc)],
          future: previous.history.future.slice(1),
        },
      };
    });
  }

  function saveDocumentFile() {
    downloadText("canvas-document.json", exportSavedDocument(doc), "application/json");
    persistDocument(doc);
    markSaved();
  }

  function exportSvg() {
    const bounds = getRenderedBounds(doc);
    const svgMarkup = buildExportSvgMarkup(doc, {
      bounds,
      includeGrid: false,
    });
    downloadText("canvas-diagram.svg", svgMarkup, "image/svg+xml");
  }

  async function exportCanvasPng() {
    const scale = 600 / 96;
    const bounds = getRenderedBounds(doc);
    const svgMarkup = buildExportSvgMarkup(doc, {
      bounds,
      includeGrid: false,
    });
    await downloadPngFromSvg("canvas-diagram.png", svgMarkup, bounds.width * scale, bounds.height * scale);
  }

  async function exportViewportPng() {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const bounds = {
      x: -pan.x / doc.ui.zoom,
      y: -pan.y / doc.ui.zoom,
      width: rect.width / doc.ui.zoom,
      height: rect.height / doc.ui.zoom,
    };
    const scale = 600 / 96;
    const svgMarkup = buildExportSvgMarkup(doc, {
      bounds,
      includeGrid: doc.ui.gridEnabled,
    });
    await downloadPngFromSvg("canvas-view.png", svgMarkup, rect.width * scale, rect.height * scale);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setDragState(null);
        dragStartDocRef.current = null;
        setConnectorSource(null);
        commitDocument(
          (draft) => {
            draft.ui.activeTool = null;
            draft.ui.selection = [];
            draft.ui.primarySelectionId = null;
          },
          { persist: false, history: false },
        );
        return;
      }

      if (event.code === "Space" && doc.ui.selection.length > 0 && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        centerSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    const activeDrag = dragState;

    if (!activeDrag) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const currentDrag = activeDrag as DragState;

      if (currentDrag.kind === "pan") {
        setPan({
          x: currentDrag.originPan.x + (event.clientX - currentDrag.startClient.x),
          y: currentDrag.originPan.y + (event.clientY - currentDrag.startClient.y),
        });
        return;
      }

      const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
      if (!world) {
        return;
      }

      if (currentDrag.kind === "move-part") {
        previewDocument((draft) => {
          const part = draft.entities[currentDrag.entityId];
          if (!isPart(part)) {
            return;
          }

          const dx = world.x - currentDrag.startWorld.x;
          const dy = world.y - currentDrag.startWorld.y;
          part.x = currentDrag.origin.x + dx;
          part.y = currentDrag.origin.y + dy;

          for (const [interfaceId, origin] of Object.entries(currentDrag.childOrigins) as Array<[string, Point]>) {
            const child = draft.entities[interfaceId];
            if (isInterface(child)) {
              child.x = origin.x + dx;
              child.y = origin.y + dy;
            }
          }
        });
      }

      if (currentDrag.kind === "move-note") {
        previewDocument((draft) => {
          const note = draft.entities[currentDrag.entityId];
          if (!isNote(note)) {
            return;
          }

          note.x = currentDrag.origin.x + (world.x - currentDrag.startWorld.x);
          note.y = currentDrag.origin.y + (world.y - currentDrag.startWorld.y);
        });
      }

      if (currentDrag.kind === "move-interface") {
        previewDocument((draft) => {
          const interfaceEntity = draft.entities[currentDrag.entityId];
          if (!isInterface(interfaceEntity)) {
            return;
          }

          interfaceEntity.x = currentDrag.origin.x + (world.x - currentDrag.startWorld.x);
          interfaceEntity.y = currentDrag.origin.y + (world.y - currentDrag.startWorld.y);
        });
      }

      if (currentDrag.kind === "move-label") {
        previewDocument((draft) => {
          const part = draft.entities[currentDrag.entityId];
          if (!isPart(part)) {
            return;
          }

          part.labelPosition.x = currentDrag.origin.x + (world.x - currentDrag.startWorld.x);
          part.labelPosition.y = currentDrag.origin.y + (world.y - currentDrag.startWorld.y);
        });
      }

      if (currentDrag.kind === "resize") {
        previewDocument((draft) => {
          const entity = draft.entities[currentDrag.entityId];
          if (
            !entity ||
            (currentDrag.entityType === "part" && !isPart(entity)) ||
            (currentDrag.entityType === "note" && !isNote(entity))
          ) {
            return;
          }

          const rectEntity = entity as PartEntity | NoteEntity;

          rectEntity.x = currentDrag.origin.x;
          rectEntity.y = currentDrag.origin.y;
          rectEntity.width = currentDrag.origin.width;
          rectEntity.height = currentDrag.origin.height;
          resizeRectFromEdge(
            rectEntity,
            currentDrag.edge,
            world.x - currentDrag.startWorld.x,
            world.y - currentDrag.startWorld.y,
            currentDrag.entityType === "part" ? draft.settings.minPartWidth : draft.settings.minNoteWidth,
            currentDrag.entityType === "part" ? draft.settings.minPartHeight : draft.settings.minNoteHeight,
          );
        });
      }
    }

    function handlePointerUp() {
      const currentDrag = activeDrag as DragState;

      if (currentDrag.kind !== "pan") {
        setState((previous) => {
          const nextDoc = structuredClone(previous.doc);
          recomputeDocument(nextDoc);
          const issues = validateDocument(nextDoc);
          persistDocument(nextDoc);
          const baseline = dragStartDocRef.current ? structuredClone(dragStartDocRef.current) : structuredClone(previous.doc);
          return {
            ...previous,
            doc: nextDoc,
            validation: issues,
            history: {
              past: [...previous.history.past, baseline],
              future: [],
            },
          };
        });
      }
      dragStartDocRef.current = null;
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [doc.ui.zoom, dragState, pan]);

  function handleCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
    updateUi((ui) => {
      ui.cursorCanvasPosition = world;
    });
  }

  function handleCanvasLeave() {
    updateUi((ui) => {
      ui.cursorCanvasPosition = null;
      ui.hoveredId = null;
    });
  }

  function handleCanvasPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button === 1) {
      event.preventDefault();
      setDragState({
        kind: "pan",
        startClient: { x: event.clientX, y: event.clientY },
        originPan: pan,
      });
      return;
    }

    if (event.target === event.currentTarget && event.button === 0) {
      clearSelection();
    }
  }

  function startMovePart(event: React.PointerEvent, part: PartEntity) {
    event.stopPropagation();
    if (event.shiftKey) {
        const selection = doc.ui.selection.includes(part.id)
          ? doc.ui.selection.filter((id) => id !== part.id)
          : [...doc.ui.selection, part.id];
      setSelection(selection, selection[selection.length - 1] ?? null);
      return;
    }

    const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
    if (!world) {
      return;
    }

    const childOrigins = Object.fromEntries(
      part.interfaceIds
        .map((interfaceId) => doc.entities[interfaceId])
        .filter(isInterface)
        .map((entity) => [entity.id, { x: entity.x, y: entity.y }]),
    );

    setSelection([part.id], part.id);
    dragStartDocRef.current = structuredClone(doc);
    setDragState({
      kind: "move-part",
      entityId: part.id,
      startWorld: world,
      origin: { x: part.x, y: part.y },
      childOrigins,
    });
  }

  function startMoveNote(event: React.PointerEvent, note: NoteEntity) {
    event.stopPropagation();
    const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
    if (!world) {
      return;
    }
    setSelection([note.id], note.id);
    dragStartDocRef.current = structuredClone(doc);
    setDragState({
      kind: "move-note",
      entityId: note.id,
      startWorld: world,
      origin: { x: note.x, y: note.y },
    });
  }

  function startMoveInterface(event: React.PointerEvent, interfaceEntity: InterfaceEntity) {
    event.stopPropagation();

    if (doc.ui.activeTool === "addConnector") {
      if (!connectorSource) {
        setConnectorSource({ kind: "interface", id: interfaceEntity.id });
        setSelection([interfaceEntity.id], interfaceEntity.id);
        return;
      }

      if (connectorSource.id !== interfaceEntity.id || connectorSource.kind !== "interface") {
        let connectorId: string | null = null;
        commitDocument((draft) => {
          connectorId = createConnectorFromEndpoints(draft, connectorSource, {
            kind: "interface",
            id: interfaceEntity.id,
          });
          if (connectorId) {
            draft.ui.selection = [connectorId];
            draft.ui.primarySelectionId = connectorId;
          }
          draft.ui.activeTool = null;
        });
        if (!connectorId) {
          window.alert("Unable to create that connector from the selected endpoints.");
        }
      }
      setConnectorSource(null);
      return;
    }

    const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
    if (!world) {
      return;
    }
    setSelection([interfaceEntity.id], interfaceEntity.id);
    dragStartDocRef.current = structuredClone(doc);
    setDragState({
      kind: "move-interface",
      entityId: interfaceEntity.id,
      startWorld: world,
      origin: { x: interfaceEntity.x, y: interfaceEntity.y },
    });
  }

  function startMoveLabel(event: React.PointerEvent, part: PartEntity) {
    event.stopPropagation();
    const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
    if (!world) {
      return;
    }
    setSelection([part.id], part.id);
    dragStartDocRef.current = structuredClone(doc);
    setDragState({
      kind: "move-label",
      entityId: part.id,
      startWorld: world,
      origin: { ...part.labelPosition },
    });
  }

  function startResize(event: React.PointerEvent, entity: PartEntity | NoteEntity, edge: Side) {
    event.stopPropagation();
    const world = screenToWorld(svgRef.current, pan, doc.ui.zoom, event.clientX, event.clientY);
    if (!world) {
      return;
    }
    setSelection([entity.id], entity.id);
    dragStartDocRef.current = structuredClone(doc);
    setDragState({
      kind: "resize",
      entityId: entity.id,
      entityType: entity.type,
      edge,
      startWorld: world,
      origin: { x: entity.x, y: entity.y, width: entity.width, height: entity.height },
    });
  }

  function handlePartPointerDown(event: React.PointerEvent, part: PartEntity) {
    if (doc.ui.activeTool === "addInterface") {
      event.stopPropagation();
      commitDocument((draft) => {
        const nextId = addInterface(draft, part.id);
        draft.ui.activeTool = null;
        if (nextId) {
          draft.ui.selection = [nextId];
          draft.ui.primarySelectionId = nextId;
        }
      });
      return;
    }

    if (doc.ui.activeTool === "addConnector") {
      event.stopPropagation();
      if (!connectorSource) {
        setConnectorSource({ kind: "part", id: part.id });
        setSelection([part.id], part.id);
        return;
      }

      if (connectorSource.id !== part.id || connectorSource.kind !== "part") {
        let connectorId: string | null = null;
        commitDocument((draft) => {
          connectorId = createConnectorFromEndpoints(draft, connectorSource, {
            kind: "part",
            id: part.id,
          });
          if (connectorId) {
            draft.ui.selection = [connectorId];
            draft.ui.primarySelectionId = connectorId;
          }
          draft.ui.activeTool = null;
        });
        if (!connectorId) {
          window.alert("Pick two different parts or interfaces from different parts to create an external connector.");
        }
      }
      setConnectorSource(null);
      return;
    }

    startMovePart(event, part);
  }

  function handleConnectorPointerDown(event: React.PointerEvent, connector: ConnectorEntity) {
    event.stopPropagation();
    setSelection([connector.id], connector.id);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__group">
          <span className="topbar__label">File</span>
          <button
            className="chip"
            type="button"
            onClick={() => loadBlankDocument({ confirmDiscard: true })}
          >
            New
          </button>
          <button className="chip" type="button" onClick={saveDocumentFile}>
            Save
          </button>
          <button className="chip" type="button" onClick={() => fileInputRef.current?.click()}>
            Load
          </button>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">Edit</span>
          <button className="chip" type="button" onClick={undo} disabled={state.history.past.length === 0}>
            Undo
          </button>
          <button className="chip" type="button" onClick={redo} disabled={state.history.future.length === 0}>
            Redo
          </button>
          <button className="chip" type="button" onClick={clearSelection}>
            Clear
          </button>
          <button className="chip danger" type="button" onClick={() => commitDocument((draft) => deleteSelection(draft))}>
            Delete
          </button>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">View</span>
          <button
            className={`chip ${doc.ui.gridEnabled ? "is-active" : ""}`}
            type="button"
            onClick={() =>
              commitDocument(
                (draft) => {
                  draft.ui.gridEnabled = !draft.ui.gridEnabled;
                },
                { history: false },
              )
            }
          >
            Grid
          </button>
          <button className="chip" type="button" onClick={fitView}>
            Fit
          </button>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">Zoom</span>
          <button className="chip" type="button" onClick={() => zoomAt(getCanvasCenter(svgRef.current) ?? { x: 0, y: 0 }, 0.9)}>
            Zoom Out
          </button>
          <button className="chip" type="button" onClick={() => commitDocument((draft) => { draft.ui.zoom = 1; }, { persist: false, history: false })}>
            {Math.round(doc.ui.zoom * 100)}%
          </button>
          <button className="chip" type="button" onClick={() => zoomAt(getCanvasCenter(svgRef.current) ?? { x: 0, y: 0 }, 1.1)}>
            Zoom In
          </button>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">Snap</span>
          <button
            className={`chip ${doc.ui.snapEnabled ? "is-active" : ""}`}
            type="button"
            onClick={() =>
              commitDocument(
                (draft) => {
                  draft.ui.snapEnabled = !draft.ui.snapEnabled;
                },
                { history: false },
              )
            }
          >
            {doc.ui.snapEnabled ? "Snap On" : "Snap Off"}
          </button>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">Validate</span>
          <button
            className="chip"
            type="button"
            onClick={() =>
              setState((previous) => ({
                ...previous,
                validation: validateDocument(previous.doc),
              }))
            }
          >
            Validate
          </button>
          <span className={`topbar__status-pill ${validationErrors.length === 0 ? "is-clean" : "is-warning"}`}>
            {validationErrors.length === 0 ? "Clean" : `${validationErrors.length} issue(s)`}
          </span>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">Export</span>
          <button className="chip" type="button" onClick={exportSvg}>
            Export SVG
          </button>
          <button className="chip" type="button" onClick={() => void exportCanvasPng().catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Canvas export failed."))}>
            Export Canvas
          </button>
          <button className="chip" type="button" onClick={() => void exportViewportPng().catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Viewport export failed."))}>
            Export View
          </button>
        </div>
        <div className="topbar__mode">
          <button className={`mode-button ${doc.ui.mode === "review" ? "is-active" : ""}`} type="button" onClick={clearSelection}>
            Review
          </button>
          <button
            className={`mode-button ${doc.ui.mode === "edit" ? "is-active" : ""}`}
            type="button"
            disabled={doc.ui.selection.length === 0}
            onClick={() =>
              commitDocument(
                (draft) => {
                  if (draft.ui.selection.length > 0) {
                    draft.ui.mode = "edit";
                  }
                },
                { persist: false, history: false },
              )
            }
          >
            Edit
          </button>
        </div>
        <div className="topbar__group">
          <span className="topbar__label">State</span>
          <span className="topbar__status">{isDirty ? "Unsaved changes" : "Saved"}</span>
        </div>
      </header>

      {showRestoreNotice ? (
        <section className="restore-banner" role="status" aria-live="polite">
          <div className="restore-banner__copy">
            <strong>Restored a previous local canvas.</strong>
            <p>
              This browser loaded your last saved diagram from local storage, which can make a newer build feel like the old app.
            </p>
          </div>
          <div className="restore-banner__actions">
            <button className="chip" type="button" onClick={() => loadStarterDocument()}>
              Load Starter
            </button>
            <button className="chip" type="button" onClick={() => loadBlankDocument()}>
              Start Blank
            </button>
            <button className="ghost-button" type="button" onClick={() => setShowRestoreNotice(false)}>
              Keep Restored Canvas
            </button>
          </div>
        </section>
      ) : null}

      <main className="workspace">
        <aside className="left-pane">
          <div className="pane-card">
            <h2>Actions</h2>
            <p className="pane-card__caption">{toolLabel}</p>
            <div className="action-list">
              <button
                className="action-button"
                type="button"
                onClick={() =>
                  commitDocument((draft) => {
                    const newId = addPart(draft, 180 + Object.keys(draft.entities).length * 20, 120 + Object.keys(draft.entities).length * 16);
                    draft.ui.selection = [newId];
                    draft.ui.primarySelectionId = newId;
                  })
                }
              >
                Add Part
              </button>
              <button
                className={`action-button ${doc.ui.activeTool === "addInterface" ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  if (singleSelection && isPart(singleSelection)) {
                    commitDocument((draft) => {
                      const newId = addInterface(draft, singleSelection.id);
                      if (newId) {
                        draft.ui.selection = [newId];
                        draft.ui.primarySelectionId = newId;
                      }
                    });
                    return;
                  }

                  setTool(doc.ui.activeTool === "addInterface" ? null : "addInterface");
                }}
              >
                Add Interface
              </button>
              <button
                className={`action-button ${doc.ui.activeTool === "addConnector" ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  setConnectorSource(null);
                  setTool(doc.ui.activeTool === "addConnector" ? null : "addConnector");
                }}
              >
                Add Connector
              </button>
              <button
                className="action-button"
                type="button"
                onClick={() =>
                  commitDocument((draft) => {
                    const newId = addNote(draft, 920 + Object.keys(draft.entities).length * 16, 240);
                    draft.ui.selection = [newId];
                    draft.ui.primarySelectionId = newId;
                  })
                }
              >
                Add Note
              </button>
              <button className="action-button danger" type="button" onClick={() => commitDocument((draft) => deleteSelection(draft))}>
                Delete Entity
              </button>
              <button
                className="action-button"
                type="button"
                onClick={() => loadStarterDocument({ confirmReset: true })}
              >
                Reset Canvas
              </button>
              {doc.ui.activeTool ? (
                <button className="ghost-button ghost-button--wide" type="button" onClick={cancelTools}>
                  Cancel Tool
                </button>
              ) : null}
            </div>
          </div>

          <div className="pane-card">
            <h2>Tree View</h2>
            <p className="pane-card__caption">Canvas selection and tree selection stay synchronized.</p>
            <div className="tree-view">
              <button className="tree-node tree-node--root" type="button" onClick={clearSelection}>
                Document
              </button>
              {doc.order
                .map((entityId) => doc.entities[entityId])
                .filter(isPart)
                .map((part) => (
                  <div key={part.id} className="tree-group">
                    <button
                      className={`tree-node ${doc.ui.selection.includes(part.id) ? "is-selected" : ""}`}
                      type="button"
                      onClick={() => setSelection([part.id], part.id)}
                    >
                      <span>Part</span>
                      <strong>{part.partId}</strong>
                    </button>
                    <div className="tree-children">
                      {part.interfaceIds
                        .map((interfaceId) => doc.entities[interfaceId])
                        .filter(isInterface)
                        .map((interfaceEntity) => (
                          <button
                            key={interfaceEntity.id}
                            className={`tree-node tree-node--child ${doc.ui.selection.includes(interfaceEntity.id) ? "is-selected" : ""}`}
                            type="button"
                            onClick={() => setSelection([interfaceEntity.id], interfaceEntity.id)}
                          >
                            <span>Interface</span>
                            <strong>{getRenderedInterfaceLabel(doc, interfaceEntity)}</strong>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              {doc.order
                .map((entityId) => doc.entities[entityId])
                .filter((entity): entity is ConnectorEntity | NoteEntity => Boolean(entity) && (isConnector(entity) || isNote(entity)))
                .map((entity) => (
                  <button
                    key={entity.id}
                    className={`tree-node ${doc.ui.selection.includes(entity.id) ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => setSelection([entity.id], entity.id)}
                  >
                    <span>{isConnector(entity) ? "Connector" : "Note"}</span>
                    <strong>{isConnector(entity) ? entity.id : entity.text.split("\n")[0] || entity.id}</strong>
                  </button>
                ))}
            </div>
          </div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-frame">
            <svg
              ref={svgRef}
              className="canvas"
              onPointerMove={handleCanvasPointerMove}
              onPointerLeave={handleCanvasLeave}
              onPointerDown={handleCanvasPointerDown}
              onWheel={(event) => {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                zoomAt(
                  { x: event.clientX - rect.left, y: event.clientY - rect.top },
                  event.deltaY > 0 ? 0.92 : 1.08,
                );
              }}
            >
              <defs>
                <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(71,85,105,0.12)" strokeWidth="1" />
                </pattern>
                <pattern id="grid-major" width="120" height="120" patternUnits="userSpaceOnUse">
                  <rect width="120" height="120" fill="url(#grid)" />
                  <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(71,85,105,0.2)" strokeWidth="1.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="#ffffff" />
              <g transform={`translate(${pan.x} ${pan.y}) scale(${doc.ui.zoom})`}>
                {doc.ui.gridEnabled ? <rect x={-2000} y={-2000} width={6000} height={6000} fill="url(#grid-major)" /> : null}
                {doc.order.map((entityId) => {
                  const entity = doc.entities[entityId];
                  if (!entity || !entity.visible) {
                    return null;
                  }

                  const isSelected = doc.ui.selection.includes(entity.id);
                  const selectionStroke = isSelected ? "#f97316" : undefined;

                  if (isPart(entity)) {
                    const fontSize = resolvePartLabelFontSize(doc, entity);
                    const labelWidth = Math.max(84, entity.partId.length * fontSize * 0.56 + 20);
                    const handleSize = 14 / doc.ui.zoom;
                    return (
                      <g key={entity.id} onPointerEnter={() => updateUi((ui) => { ui.hoveredId = entity.id; })} onPointerLeave={() => updateUi((ui) => { ui.hoveredId = null; })}>
                        <rect
                          x={entity.x}
                          y={entity.y}
                          width={entity.width}
                          height={entity.height}
                          rx={entity.style.cornerRadius}
                          fill={entity.style.fill}
                          stroke={selectionStroke ?? entity.style.stroke}
                          strokeWidth={isSelected ? entity.style.strokeWidth + 1 : entity.style.strokeWidth}
                          onPointerDown={(event) => handlePartPointerDown(event, entity)}
                        />
                        <rect
                          x={entity.x + entity.labelPosition.x - 8}
                          y={entity.y + entity.labelPosition.y - 6}
                          width={labelWidth}
                          height={fontSize * 1.35}
                          rx={10}
                          fill="rgba(255,255,255,0.82)"
                          stroke={isSelected ? "#f97316" : "rgba(29,36,51,0.12)"}
                          onPointerDown={(event) => startMoveLabel(event, entity)}
                        />
                        <text
                          x={entity.x + entity.labelPosition.x}
                          y={entity.y + entity.labelPosition.y}
                          fontSize={fontSize}
                          fontFamily='"Avenir Next", "Segoe UI", sans-serif'
                          fontWeight={700}
                          fill="#111827"
                          dominantBaseline="hanging"
                          pointerEvents="none"
                        >
                          {entity.partId}
                        </text>
                        {isSelected ? (
                          <>
                            <rect
                              className="resize-handle"
                              x={entity.x + entity.width / 2 - handleSize / 2}
                              y={entity.y - handleSize / 2}
                              width={handleSize}
                              height={handleSize}
                              onPointerDown={(event) => startResize(event, entity, "top")}
                            />
                            <rect
                              className="resize-handle"
                              x={entity.x + entity.width / 2 - handleSize / 2}
                              y={entity.y + entity.height - handleSize / 2}
                              width={handleSize}
                              height={handleSize}
                              onPointerDown={(event) => startResize(event, entity, "bottom")}
                            />
                            <rect
                              className="resize-handle"
                              x={entity.x - handleSize / 2}
                              y={entity.y + entity.height / 2 - handleSize / 2}
                              width={handleSize}
                              height={handleSize}
                              onPointerDown={(event) => startResize(event, entity, "left")}
                            />
                            <rect
                              className="resize-handle"
                              x={entity.x + entity.width - handleSize / 2}
                              y={entity.y + entity.height / 2 - handleSize / 2}
                              width={handleSize}
                              height={handleSize}
                              onPointerDown={(event) => startResize(event, entity, "right")}
                            />
                          </>
                        ) : null}
                      </g>
                    );
                  }

                  if (isInterface(entity)) {
                    const fontSize = resolveInterfaceFontSize(doc, entity);
                    return (
                      <g key={entity.id} onPointerEnter={() => updateUi((ui) => { ui.hoveredId = entity.id; })} onPointerLeave={() => updateUi((ui) => { ui.hoveredId = null; })}>
                        <rect
                          x={entity.x}
                          y={entity.y}
                          width={entity.width}
                          height={entity.height}
                          rx={entity.style.cornerRadius}
                          fill={resolveInterfaceFill(doc, entity)}
                          stroke={selectionStroke ?? entity.style.stroke}
                          strokeDasharray={entity.snap.attachedToPartEdge ? undefined : "8 4"}
                          strokeWidth={isSelected ? entity.style.strokeWidth + 0.75 : entity.style.strokeWidth}
                          onPointerDown={(event) => startMoveInterface(event, entity)}
                        />
                        <text
                          x={entity.x + entity.width / 2}
                          y={entity.y + entity.height / 2}
                          fontSize={fontSize}
                          fontFamily={entity.textStyle.fontFamily}
                          fontWeight={entity.textStyle.fontWeight}
                          fill={entity.textStyle.fill}
                          textAnchor="middle"
                          dominantBaseline="central"
                          pointerEvents="none"
                        >
                          {getRenderedInterfaceLabel(doc, entity)}
                        </text>
                      </g>
                    );
                  }

                  if (isConnector(entity)) {
                    const points = entity.routing.segments;
                    if (points.length < 2) {
                      return null;
                    }

                    const sourceArrowSize = resolveConnectorArrowSize(doc, entity);
                    const labelPoint = getConnectorLabelPoint(entity);
                    const labelRect = getConnectorLabelRect(entity);
                    return (
                      <g key={entity.id} onPointerEnter={() => updateUi((ui) => { ui.hoveredId = entity.id; })} onPointerLeave={() => updateUi((ui) => { ui.hoveredId = null; })}>
                        <polyline
                          fill="none"
                          stroke={selectionStroke ?? entity.style.stroke}
                          strokeWidth={isSelected ? entity.style.strokeWidth + 1 : entity.style.strokeWidth}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                          onPointerDown={(event) => handleConnectorPointerDown(event, entity)}
                        />
                        {entity.direction.arrowHeadSide === "target" || entity.direction.arrowHeadSide === "both" ? (
                          <polygon
                            points={arrowHeadPoints(points[points.length - 2]!, points[points.length - 1]!, sourceArrowSize)}
                            fill={selectionStroke ?? entity.style.stroke}
                          />
                        ) : null}
                        {entity.direction.arrowHeadSide === "source" || entity.direction.arrowHeadSide === "both" ? (
                          <polygon
                            points={arrowHeadPoints(points[1]!, points[0]!, sourceArrowSize)}
                            fill={selectionStroke ?? entity.style.stroke}
                          />
                        ) : null}
                        {entity.content && labelPoint && labelRect ? (
                          <>
                            <rect
                              x={labelRect.x}
                              y={labelRect.y}
                              width={labelRect.width}
                              height={labelRect.height}
                              rx={12}
                              fill="rgba(255,255,255,0.94)"
                              stroke="rgba(148,163,184,0.35)"
                            />
                            <text
                              x={labelPoint.x}
                              y={labelPoint.y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={entity.textStyle.fontSize}
                              fontFamily={entity.textStyle.fontFamily}
                              fontWeight={entity.textStyle.fontWeight}
                              fill={entity.textStyle.fill}
                              pointerEvents="none"
                            >
                              {entity.content}
                            </text>
                          </>
                        ) : null}
                      </g>
                    );
                  }

                  const lines = wrapText(entity.text, {
                    maxWidth: Math.max(entity.width - 28, 90),
                    fontFamily: entity.textStyle.fontFamily,
                    fontSize: entity.textStyle.fontSize,
                    fontWeight: entity.textStyle.fontWeight,
                  });
                  const handleSize = 14 / doc.ui.zoom;

                  return (
                    <g key={entity.id} onPointerEnter={() => updateUi((ui) => { ui.hoveredId = entity.id; })} onPointerLeave={() => updateUi((ui) => { ui.hoveredId = null; })}>
                      <rect
                        x={entity.x}
                        y={entity.y}
                        width={entity.width}
                        height={entity.height}
                        rx={entity.style.cornerRadius}
                        fill={entity.style.fill}
                        stroke={selectionStroke ?? entity.style.stroke}
                        strokeWidth={isSelected ? entity.style.strokeWidth + 1 : entity.style.strokeWidth}
                        onPointerDown={(event) => startMoveNote(event, entity)}
                      />
                      <text
                        x={entity.x + 16}
                        y={entity.y + 18}
                        fontSize={entity.textStyle.fontSize}
                        fontFamily={entity.textStyle.fontFamily}
                        fontWeight={entity.textStyle.fontWeight}
                        fill={entity.textStyle.fill}
                        dominantBaseline="hanging"
                        pointerEvents="none"
                      >
                        {lines.map((line, index) => (
                          <tspan key={`${entity.id}-${index}`} x={entity.x + 16} dy={index === 0 ? 0 : entity.textStyle.fontSize * entity.textStyle.lineHeight}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                      {isSelected ? (
                        <>
                          <rect
                            className="resize-handle"
                            x={entity.x + entity.width / 2 - handleSize / 2}
                            y={entity.y - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            onPointerDown={(event) => startResize(event, entity, "top")}
                          />
                          <rect
                            className="resize-handle"
                            x={entity.x + entity.width / 2 - handleSize / 2}
                            y={entity.y + entity.height - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            onPointerDown={(event) => startResize(event, entity, "bottom")}
                          />
                          <rect
                            className="resize-handle"
                            x={entity.x - handleSize / 2}
                            y={entity.y + entity.height / 2 - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            onPointerDown={(event) => startResize(event, entity, "left")}
                          />
                          <rect
                            className="resize-handle"
                            x={entity.x + entity.width - handleSize / 2}
                            y={entity.y + entity.height / 2 - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            onPointerDown={(event) => startResize(event, entity, "right")}
                          />
                        </>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </section>

        <aside className="right-pane">
          {doc.ui.mode === "review" ? (
            <div className="pane-card">
              <h2>Review Mode</h2>
              <div className="pane-section">
                <h3>Document Settings</h3>
                <CommitNumberInput
                  label="Arrow Size"
                  value={doc.settings.arrowSize}
                  min={6}
                  max={48}
                  onCommit={(nextValue) => commitDocument((draft) => { draft.settings.arrowSize = nextValue; })}
                />
                <CommitColorInput
                  label="Interface Fill"
                  value={doc.settings.interfaceFillColor}
                  onCommit={(nextValue) => commitDocument((draft) => { draft.settings.interfaceFillColor = nextValue; })}
                />
                <CommitNumberInput
                  label="Part ID Font Size"
                  value={doc.settings.partIdFontSize}
                  min={10}
                  max={32}
                  onCommit={(nextValue) => commitDocument((draft) => { draft.settings.partIdFontSize = nextValue; })}
                />
                <CommitNumberInput
                  label="Interface Font Size"
                  value={doc.settings.interfaceFontSize}
                  min={10}
                  max={28}
                  onCommit={(nextValue) => commitDocument((draft) => { draft.settings.interfaceFontSize = nextValue; })}
                />
              </div>
              <div className="pane-section">
                <h3>Canvas Summary</h3>
                <div className="summary-grid">
                  <span>Parts</span>
                  <strong>{Object.values(doc.entities).filter(isPart).length}</strong>
                  <span>Interfaces</span>
                  <strong>{Object.values(doc.entities).filter(isInterface).length}</strong>
                  <span>Connectors</span>
                  <strong>{Object.values(doc.entities).filter(isConnector).length}</strong>
                  <span>Notes</span>
                  <strong>{Object.values(doc.entities).filter(isNote).length}</strong>
                  <span>Validation</span>
                  <strong>{validationErrors.length === 0 ? "Clean" : `${validationErrors.length} error(s)`}</strong>
                </div>
              </div>
              <div className="pane-section">
                <h3>Validation Status</h3>
                {state.validation.length === 0 ? <p className="empty-state">Everything currently validates.</p> : null}
                {state.validation.map((issue) => (
                  <div key={issue.id} className={`validation-issue validation-issue--${issue.level}`}>
                    {issue.message}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="pane-card">
              <h2>Edit Mode</h2>
              {doc.ui.selection.length > 1 ? (
                <div className="pane-section">
                  <h3>Multi-selection</h3>
                  <p className="empty-state">Entity-specific fields are hidden when more than one item is selected.</p>
                  <div className="selection-list">
                    {selectedEntities.map((entity) => (
                      <div key={entity.id} className="selection-pill">
                        {getEntityDisplayName(doc, entity.id)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {singleSelection && isPart(singleSelection) ? (
                <div className="pane-section">
                  <h3>{getEntityDisplayName(doc, singleSelection.id)}</h3>
                  <CommitTextInput
                    label="Part ID"
                    value={singleSelection.partId}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const part = draft.entities[singleSelection.id];
                      if (isPart(part)) {
                        part.partId = nextValue.trim() || part.partId;
                      }
                    })}
                  />
                  <CommitColorInput
                    label="Fill"
                    value={singleSelection.style.fill}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const part = draft.entities[singleSelection.id];
                      if (isPart(part)) {
                        part.style.fill = nextValue;
                      }
                    })}
                  />
                  <NullableNumberInput
                    label="Part Label Font Size"
                    value={singleSelection.textStyle.partIdFontSize}
                    resolvedValue={resolvePartLabelFontSize(doc, singleSelection)}
                    min={10}
                    max={32}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const part = draft.entities[singleSelection.id];
                      if (isPart(part)) {
                        part.textStyle.partIdFontSize = nextValue;
                      }
                    })}
                  />
                  <NullableNumberInput
                    label="Default Interface Font Size"
                    value={singleSelection.childDefaults.interfaceFontSize}
                    resolvedValue={doc.settings.interfaceFontSize}
                    min={10}
                    max={28}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const part = draft.entities[singleSelection.id];
                      if (isPart(part)) {
                        part.childDefaults.interfaceFontSize = nextValue;
                      }
                    })}
                  />
                  <NullableColorInput
                    label="Default Interface Fill"
                    value={singleSelection.childDefaults.interfaceFillColor}
                    resolvedValue={doc.settings.interfaceFillColor}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const part = draft.entities[singleSelection.id];
                      if (isPart(part)) {
                        part.childDefaults.interfaceFillColor = nextValue;
                      }
                    })}
                  />
                </div>
              ) : null}

              {singleSelection && isInterface(singleSelection) ? (
                <div className="pane-section">
                  <h3>{getEntityDisplayName(doc, singleSelection.id)}</h3>
                  <CommitTextInput
                    label="Local Name"
                    value={singleSelection.localName}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const interfaceEntity = draft.entities[singleSelection.id];
                      if (isInterface(interfaceEntity)) {
                        interfaceEntity.localName = nextValue.trim();
                      }
                    })}
                  />
                  <NullableNumberInput
                    label="Font Size"
                    value={singleSelection.textStyle.fontSize}
                    resolvedValue={resolveInterfaceFontSize(doc, singleSelection)}
                    min={10}
                    max={28}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const interfaceEntity = draft.entities[singleSelection.id];
                      if (isInterface(interfaceEntity)) {
                        interfaceEntity.textStyle.fontSize = nextValue;
                      }
                    })}
                  />
                  <NullableColorInput
                    label="Fill"
                    value={singleSelection.style.fill}
                    resolvedValue={resolveInterfaceFill(doc, singleSelection)}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const interfaceEntity = draft.entities[singleSelection.id];
                      if (isInterface(interfaceEntity)) {
                        interfaceEntity.style.fill = nextValue;
                      }
                    })}
                  />
                </div>
              ) : null}

              {singleSelection && isConnector(singleSelection) ? (
                <div className="pane-section">
                  <h3>{singleSelection.id}</h3>
                  <CommitSelect
                    label="Source Preferred Side"
                    value={singleSelection.source.preferredSide}
                    options={["auto", "top", "right", "bottom", "left"]}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.source.preferredSide = nextValue as ConnectorEntity["source"]["preferredSide"];
                      }
                    })}
                  />
                  <CommitSelect
                    label="Target Preferred Side"
                    value={singleSelection.target.preferredSide}
                    options={["auto", "top", "right", "bottom", "left"]}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.target.preferredSide = nextValue as ConnectorEntity["target"]["preferredSide"];
                      }
                    })}
                  />
                  <CommitSelect
                    label="Arrow Head Side"
                    value={singleSelection.direction.arrowHeadSide}
                    options={["none", "source", "target", "both"]}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.direction.arrowHeadSide = nextValue as ConnectorEntity["direction"]["arrowHeadSide"];
                      }
                    })}
                  />
                  <NullableNumberInput
                    label="Arrow Size Override"
                    value={singleSelection.arrowSizeOverride}
                    resolvedValue={doc.settings.arrowSize}
                    min={6}
                    max={48}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.arrowSizeOverride = nextValue;
                      }
                    })}
                  />
                  <CommitTextArea
                    label="Content"
                    value={singleSelection.content}
                    rows={3}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.content = nextValue;
                      }
                    })}
                  />
                  <CommitColorInput
                    label="Stroke"
                    value={singleSelection.style.stroke}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.style.stroke = nextValue;
                      }
                    })}
                  />
                  <CommitNumberInput
                    label="Stroke Width"
                    value={singleSelection.style.strokeWidth}
                    min={1}
                    max={8}
                    step={0.5}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        connector.style.strokeWidth = nextValue;
                      }
                    })}
                  />
                  <button
                    className="ghost-button ghost-button--wide"
                    type="button"
                    onClick={() => commitDocument((draft) => {
                      const connector = draft.entities[singleSelection.id];
                      if (isConnector(connector)) {
                        reverseConnectorDirection(connector);
                      }
                    })}
                  >
                    Reverse Direction
                  </button>
                </div>
              ) : null}

              {singleSelection && isNote(singleSelection) ? (
                <div className="pane-section">
                  <h3>{singleSelection.id}</h3>
                  <CommitTextArea
                    label="Text"
                    value={singleSelection.text}
                    rows={5}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const note = draft.entities[singleSelection.id];
                      if (isNote(note)) {
                        note.text = nextValue;
                      }
                    })}
                  />
                  <CommitNumberInput
                    label="Font Size"
                    value={singleSelection.textStyle.fontSize}
                    min={10}
                    max={24}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const note = draft.entities[singleSelection.id];
                      if (isNote(note)) {
                        note.textStyle.fontSize = nextValue;
                      }
                    })}
                  />
                  <CommitColorInput
                    label="Fill"
                    value={singleSelection.style.fill}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const note = draft.entities[singleSelection.id];
                      if (isNote(note)) {
                        note.style.fill = nextValue;
                      }
                    })}
                  />
                  <CommitColorInput
                    label="Stroke"
                    value={singleSelection.style.stroke}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const note = draft.entities[singleSelection.id];
                      if (isNote(note)) {
                        note.style.stroke = nextValue;
                      }
                    })}
                  />
                  <CommitNumberInput
                    label="Stroke Width"
                    value={singleSelection.style.strokeWidth}
                    min={1}
                    max={6}
                    step={0.5}
                    onCommit={(nextValue) => commitDocument((draft) => {
                      const note = draft.entities[singleSelection.id];
                      if (isNote(note)) {
                        note.style.strokeWidth = nextValue;
                      }
                    })}
                  />
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </main>

      <footer className="statusbar">
        <span>cursor: {formatPoint(doc.ui.cursorCanvasPosition)}</span>
        <span>zoom: {Math.round(doc.ui.zoom * 100)}%</span>
        <span>grid: {doc.ui.gridEnabled ? "on" : "off"}</span>
        <span>snap: {doc.ui.snapEnabled ? "on" : "off"}</span>
        <span>hover: {doc.ui.hoveredId ?? "none"}</span>
        <span>selected: {doc.ui.selection.length}</span>
        <span>tool: {doc.ui.activeTool ?? "none"}</span>
      </footer>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept="application/json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          try {
            const text = await file.text();
            const nextDoc = deserializeDocument(JSON.parse(text) as DocumentModel);
            replaceStateDocument(nextDoc, {
              clearHistory: true,
              saved: true,
            });
            setConnectorSource(null);
            setDragState(null);
            dragStartDocRef.current = null;
          } catch (error) {
            window.alert(`Unable to import document: ${error instanceof Error ? error.message : "Unknown error"}`);
          } finally {
            event.target.value = "";
          }
        }}
      />
    </div>
  );
}
