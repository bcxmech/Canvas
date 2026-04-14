import {
  ARROW_HEAD_OPTIONS,
  type ArrowHeadSide,
  type ConnectorEntity,
  type ConnectorCreationEndpoint,
  type ConnectorKind,
  type DocumentModel,
  type Entity,
  type InterfaceEntity,
  type NoteEntity,
  type PartEntity,
  PREFERRED_SIDE_OPTIONS,
  type Point,
  type Rect,
  SIDES,
  type Side,
  type ValidationIssue,
} from "./types";

const DEFAULT_FONT_FAMILY = '"Avenir Next", "Segoe UI", sans-serif';
const STORAGE_KEY = "canvas-react-app.document";
const GRID_SIZE = 24;
const ROUTE_CLEARANCE = 18;
const ROUTE_STUB = 18;
const DEFAULT_INTERFACE_SIZE = { width: 140, height: 28 };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inflateRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function rectFromPoints(points: Point[]): Rect | null {
  if (points.length === 0) {
    return null;
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 1200, height: 800 };
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function rectContainsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectContainsRect(parent: Rect, child: Rect): boolean {
  return (
    child.x >= parent.x &&
    child.y >= parent.y &&
    child.x + child.width <= parent.x + parent.width &&
    child.y + child.height <= parent.y + parent.height
  );
}

function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function simplifyOrthogonalPath(points: Point[]): Point[] {
  const deduped = points.filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1]!));
  const simplified: Point[] = [];

  for (const point of deduped) {
    const last = simplified[simplified.length - 1];
    const prev = simplified[simplified.length - 2];

    if (!last || !prev) {
      simplified.push(point);
      continue;
    }

    const sameX = prev.x === last.x && last.x === point.x;
    const sameY = prev.y === last.y && last.y === point.y;

    if (sameX || sameY) {
      simplified[simplified.length - 1] = point;
      continue;
    }

    simplified.push(point);
  }

  return simplified;
}

function segmentAxis(a: Point, b: Point): "horizontal" | "vertical" | null {
  if (a.x === b.x && a.y !== b.y) {
    return "vertical";
  }

  if (a.y === b.y && a.x !== b.x) {
    return "horizontal";
  }

  return null;
}

function isOrthogonalConnectorRoute(points: Point[]): boolean {
  if (points.length < 2) {
    return true;
  }

  for (let index = 1; index < points.length; index += 1) {
    if (!segmentAxis(points[index - 1]!, points[index]!)) {
      return false;
    }
  }

  for (let index = 2; index < points.length; index += 1) {
    const firstAxis = segmentAxis(points[index - 2]!, points[index - 1]!);
    const secondAxis = segmentAxis(points[index - 1]!, points[index]!);

    if (!firstAxis || !secondAxis || firstAxis === secondAxis) {
      return false;
    }
  }

  return true;
}

function measureTextWidth(
  text: string,
  options: { fontSize: number; fontFamily: string; fontWeight?: number },
): number {
  const { fontSize, fontFamily, fontWeight = 400 } = options;

  if (typeof document !== "undefined") {
    const cache = measureTextWidth as typeof measureTextWidth & { canvas?: HTMLCanvasElement };
    const canvas = cache.canvas ?? (cache.canvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      return ctx.measureText(text).width;
    }
  }

  return text.length * fontSize * 0.6;
}

function nextIndex(doc: DocumentModel, type: Entity["type"]): number {
  return Object.values(doc.entities).filter((entity) => entity.type === type).length + 1;
}

function nextPartLabel(doc: DocumentModel): string {
  const index = nextIndex(doc, "part");
  const alpha = String.fromCharCode(64 + (((index - 1) % 26) + 1));
  const suffix = index > 26 ? String(Math.floor((index - 1) / 26) + 1) : "";
  return `part${alpha}${suffix}`;
}

function createDefaultPart(doc: DocumentModel, x: number, y: number): PartEntity {
  const partId = nextPartLabel(doc);
  const index = nextIndex(doc, "part");
  return {
    id: `part:${index}`,
    type: "part",
    x,
    y,
    width: 320,
    height: 200,
    partId,
    interfaceIds: [],
    labelPosition: { x: 16, y: 16 },
    style: {
      fill: "#fffaf0",
      stroke: "#1d2433",
      strokeWidth: 2,
      cornerRadius: 16,
    },
    textStyle: {
      partIdFontSize: null,
    },
    childDefaults: {
      interfaceFontSize: null,
      interfaceFillColor: null,
    },
    visible: true,
    locked: false,
  };
}

function createDefaultInterface(doc: DocumentModel, parentPartId: string, x: number, y: number): InterfaceEntity {
  const index = nextIndex(doc, "interface");
  return {
    id: `interface:${index}`,
    type: "interface",
    parentPartId,
    localName: `inf${index}`,
    x,
    y,
    width: DEFAULT_INTERFACE_SIZE.width,
    height: DEFAULT_INTERFACE_SIZE.height,
    layout: {
      paddingX: 12,
      paddingY: 6,
      lineHeight: 1.2,
      maxWidth: 240,
    },
    textStyle: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: null,
      fontWeight: 600,
      fill: "#0f172a",
    },
    style: {
      fill: null,
      stroke: "#1d2433",
      strokeWidth: 1.5,
      cornerRadius: 999,
    },
    snap: {
      attachedToPartEdge: null,
    },
    visible: true,
    locked: false,
  };
}

function createDefaultConnector(doc: DocumentModel, sourceId: string, targetId: string): ConnectorEntity {
  const index = nextIndex(doc, "connector");
  return {
    id: `connector:${index}`,
    type: "connector",
    source: {
      interfaceId: sourceId,
      preferredSide: "auto",
      resolvedSide: "right",
    },
    target: {
      interfaceId: targetId,
      preferredSide: "auto",
      resolvedSide: "left",
    },
    direction: {
      arrowHeadSide: "target",
    },
    arrowSizeOverride: null,
    content: "",
    style: {
      stroke: "#222222",
      strokeWidth: 2,
    },
    textStyle: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 14,
      fontWeight: 400,
      fill: "#111111",
    },
    routing: {
      kind: "orthogonal",
      segments: [],
    },
    visible: true,
    locked: false,
  };
}

function createDefaultNote(doc: DocumentModel, x: number, y: number): NoteEntity {
  const index = nextIndex(doc, "note");
  return {
    id: `note:${index}`,
    type: "note",
    x,
    y,
    width: 220,
    height: 120,
    text: "Capture assumptions,\nreview routing,\nand validate references.",
    textStyle: {
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: 14,
      fontWeight: 500,
      fill: "#1f2937",
      lineHeight: 1.35,
    },
    style: {
      fill: "#fff0bd",
      stroke: "#7c5e10",
      strokeWidth: 1.5,
      cornerRadius: 14,
    },
    visible: true,
    locked: false,
  };
}

export function createBlankDocument(): DocumentModel {
  return {
    settings: {
      arrowSize: 12,
      interfaceFillColor: "#ffffff",
      partIdFontSize: 16,
      interfaceFontSize: 14,
      snapThreshold: 12,
      minPartWidth: 120,
      minPartHeight: 80,
      minNoteWidth: 120,
      minNoteHeight: 60,
      minInterfaceWidth: 80,
      minInterfaceHeight: 24,
    },
    entities: {},
    order: [],
    ui: {
      mode: "review",
      selection: [],
      primarySelectionId: null,
      hoveredId: null,
      cursorCanvasPosition: null,
      zoom: 1,
      gridEnabled: true,
      snapEnabled: true,
      activeTool: null,
    },
  };
}

export function createStarterDocument(): DocumentModel {
  const doc = createBlankDocument();

  const partA = createDefaultPart(doc, 120, 120);
  partA.partId = "partA";
  const partB = createDefaultPart(doc, 620, 180);
  partB.id = "part:2";
  partB.partId = "partB";
  partB.style.fill = "#f5f4ff";
  partB.childDefaults.interfaceFillColor = "#f8f5ff";

  doc.entities[partA.id] = partA;
  doc.entities[partB.id] = partB;
  doc.order.push(partA.id, partB.id);

  const interfaceA1 = createDefaultInterface(doc, partA.id, 300, 180);
  interfaceA1.id = "interface:1";
  interfaceA1.localName = "engine";
  interfaceA1.snap.attachedToPartEdge = "right";

  const interfaceA2 = createDefaultInterface(doc, partA.id, 180, 262);
  interfaceA2.id = "interface:2";
  interfaceA2.localName = "control";
  interfaceA2.snap.attachedToPartEdge = "bottom";

  const interfaceB1 = createDefaultInterface(doc, partB.id, 620, 240);
  interfaceB1.id = "interface:3";
  interfaceB1.localName = "engine";
  interfaceB1.snap.attachedToPartEdge = "left";

  const interfaceB2 = createDefaultInterface(doc, partB.id, 820, 320);
  interfaceB2.id = "interface:4";
  interfaceB2.localName = "telemetry";
  interfaceB2.snap.attachedToPartEdge = "right";

  doc.entities[interfaceA1.id] = interfaceA1;
  doc.entities[interfaceA2.id] = interfaceA2;
  doc.entities[interfaceB1.id] = interfaceB1;
  doc.entities[interfaceB2.id] = interfaceB2;
  doc.order.push(interfaceA1.id, interfaceA2.id, interfaceB1.id, interfaceB2.id);

  const connector = createDefaultConnector(doc, interfaceA1.id, interfaceB1.id);
  connector.id = "connector:1";
  connector.content = "power bus";
  doc.entities[connector.id] = connector;
  doc.order.push(connector.id);

  const note = createDefaultNote(doc, 1020, 140);
  note.id = "note:1";
  note.text = "Use the Review pane\nfor defaults and validation.\nConnector routes re-evaluate\nwhenever geometry changes.";
  doc.entities[note.id] = note;
  doc.order.push(note.id);

  recomputeDocument(doc);
  return doc;
}

export function isPart(entity: Entity | undefined): entity is PartEntity {
  return entity?.type === "part";
}

export function isInterface(entity: Entity | undefined): entity is InterfaceEntity {
  return entity?.type === "interface";
}

export function isConnector(entity: Entity | undefined): entity is ConnectorEntity {
  return entity?.type === "connector";
}

export function isNote(entity: Entity | undefined): entity is NoteEntity {
  return entity?.type === "note";
}

export function isRectEntity(entity: Entity | undefined): entity is PartEntity | InterfaceEntity | NoteEntity {
  return entity?.type === "part" || entity?.type === "interface" || entity?.type === "note";
}

export function getEntityRect(entity: PartEntity | InterfaceEntity | NoteEntity): Rect {
  return {
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height,
  };
}

export function getEdgeMidpoint(entity: PartEntity | InterfaceEntity | NoteEntity, side: Side): Point {
  const centerX = entity.x + entity.width / 2;
  const centerY = entity.y + entity.height / 2;

  switch (side) {
    case "top":
      return { x: centerX, y: entity.y };
    case "right":
      return { x: entity.x + entity.width, y: centerY };
    case "bottom":
      return { x: centerX, y: entity.y + entity.height };
    case "left":
      return { x: entity.x, y: centerY };
  }
}

function offsetFromSide(point: Point, side: Side, distance: number): Point {
  switch (side) {
    case "top":
      return { x: point.x, y: point.y - distance };
    case "right":
      return { x: point.x + distance, y: point.y };
    case "bottom":
      return { x: point.x, y: point.y + distance };
    case "left":
      return { x: point.x - distance, y: point.y };
  }
}

export function resolvePartLabelFontSize(doc: DocumentModel, part: PartEntity): number {
  return part.textStyle.partIdFontSize ?? doc.settings.partIdFontSize;
}

export function resolveInterfaceFontSize(doc: DocumentModel, interfaceEntity: InterfaceEntity): number {
  const parent = doc.entities[interfaceEntity.parentPartId];
  return (
    interfaceEntity.textStyle.fontSize ??
    (isPart(parent) ? parent.childDefaults.interfaceFontSize : null) ??
    doc.settings.interfaceFontSize
  );
}

export function resolveInterfaceFill(doc: DocumentModel, interfaceEntity: InterfaceEntity): string {
  const parent = doc.entities[interfaceEntity.parentPartId];
  return (
    interfaceEntity.style.fill ??
    (isPart(parent) ? parent.childDefaults.interfaceFillColor : null) ??
    doc.settings.interfaceFillColor
  );
}

export function resolveConnectorArrowSize(doc: DocumentModel, connector: ConnectorEntity): number {
  return connector.arrowSizeOverride ?? doc.settings.arrowSize;
}

export function getRenderedInterfaceLabel(doc: DocumentModel, interfaceEntity: InterfaceEntity): string {
  const parent = doc.entities[interfaceEntity.parentPartId];
  const partId = isPart(parent) ? parent.partId : "missing";
  const localName = interfaceEntity.localName.trim() || "interface";
  return `${partId}_${localName}`;
}

export function getEntityDisplayName(doc: DocumentModel, entityId: string): string {
  const entity = doc.entities[entityId];

  if (!entity) {
    return entityId;
  }

  if (isPart(entity)) {
    return `${entity.id} (${entity.partId})`;
  }

  if (isInterface(entity)) {
    return `${entity.id} (${getRenderedInterfaceLabel(doc, entity)})`;
  }

  if (isConnector(entity)) {
    return entity.id;
  }

  return `${entity.id} (${entity.text.split("\n")[0] ?? "note"})`;
}

export function getPartLabelRect(doc: DocumentModel, part: PartEntity): Rect {
  const fontSize = resolvePartLabelFontSize(doc, part);
  const width = measureTextWidth(part.partId, {
    fontSize,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: 700,
  });
  const height = fontSize * 1.25;

  return {
    x: part.x + part.labelPosition.x,
    y: part.y + part.labelPosition.y,
    width,
    height,
  };
}

function clampPartLabel(doc: DocumentModel, part: PartEntity): void {
  const rect = getPartLabelRect(doc, part);
  const padding = 8;
  const maxX = Math.max(padding, part.width - rect.width - padding);
  const maxY = Math.max(padding, part.height - rect.height - padding);

  part.labelPosition.x = clamp(part.labelPosition.x, padding, maxX);
  part.labelPosition.y = clamp(part.labelPosition.y, padding, maxY);
}

function chooseSideTowardOtherPart(sourcePart: PartEntity, otherPart: PartEntity): Side {
  const sourceCenter = {
    x: sourcePart.x + sourcePart.width / 2,
    y: sourcePart.y + sourcePart.height / 2,
  };
  const otherCenter = {
    x: otherPart.x + otherPart.width / 2,
    y: otherPart.y + otherPart.height / 2,
  };
  const dx = otherCenter.x - sourceCenter.x;
  const dy = otherCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}

function oppositeSide(side: Side): Side {
  switch (side) {
    case "top":
      return "bottom";
    case "right":
      return "left";
    case "bottom":
      return "top";
    case "left":
      return "right";
  }
}

function getInterfacePositionOnPartEdge(parent: PartEntity, side: Side): Point {
  const width = DEFAULT_INTERFACE_SIZE.width;
  const height = DEFAULT_INTERFACE_SIZE.height;

  switch (side) {
    case "top":
      return {
        x: parent.x + (parent.width - width) / 2,
        y: parent.y,
      };
    case "right":
      return {
        x: parent.x + parent.width - width,
        y: parent.y + (parent.height - height) / 2,
      };
    case "bottom":
      return {
        x: parent.x + (parent.width - width) / 2,
        y: parent.y + parent.height - height,
      };
    case "left":
      return {
        x: parent.x,
        y: parent.y + (parent.height - height) / 2,
      };
  }
}

function autoSizeInterface(doc: DocumentModel, interfaceEntity: InterfaceEntity): void {
  const label = getRenderedInterfaceLabel(doc, interfaceEntity);
  const fontSize = resolveInterfaceFontSize(doc, interfaceEntity);
  const textWidth = measureTextWidth(label, {
    fontSize,
    fontFamily: interfaceEntity.textStyle.fontFamily,
    fontWeight: interfaceEntity.textStyle.fontWeight,
  });

  interfaceEntity.width = clamp(
    textWidth + interfaceEntity.layout.paddingX * 2,
    doc.settings.minInterfaceWidth,
    interfaceEntity.layout.maxWidth,
  );
  interfaceEntity.height = Math.max(
    doc.settings.minInterfaceHeight,
    fontSize * interfaceEntity.layout.lineHeight + interfaceEntity.layout.paddingY * 2,
  );
}

function clampInterfaceWithinParent(doc: DocumentModel, interfaceEntity: InterfaceEntity, parent: PartEntity): void {
  const maxX = parent.x + parent.width - interfaceEntity.width;
  const maxY = parent.y + parent.height - interfaceEntity.height;

  interfaceEntity.x = clamp(interfaceEntity.x, parent.x, maxX);
  interfaceEntity.y = clamp(interfaceEntity.y, parent.y, maxY);

  if (!doc.ui.snapEnabled) {
    interfaceEntity.snap.attachedToPartEdge = null;
    return;
  }

  const distances: Array<{ side: Side; distance: number }> = [
    { side: "top", distance: Math.abs(interfaceEntity.y - parent.y) },
    {
      side: "right",
      distance: Math.abs(parent.x + parent.width - (interfaceEntity.x + interfaceEntity.width)),
    },
    {
      side: "bottom",
      distance: Math.abs(parent.y + parent.height - (interfaceEntity.y + interfaceEntity.height)),
    },
    { side: "left", distance: Math.abs(interfaceEntity.x - parent.x) },
  ];

  const closest = distances.sort((a, b) => a.distance - b.distance)[0];

  if (!closest || closest.distance > doc.settings.snapThreshold) {
    interfaceEntity.snap.attachedToPartEdge = null;
    return;
  }

  interfaceEntity.snap.attachedToPartEdge = closest.side;

  if (closest.side === "top") {
    interfaceEntity.y = parent.y;
  }

  if (closest.side === "right") {
    interfaceEntity.x = parent.x + parent.width - interfaceEntity.width;
  }

  if (closest.side === "bottom") {
    interfaceEntity.y = parent.y + parent.height - interfaceEntity.height;
  }

  if (closest.side === "left") {
    interfaceEntity.x = parent.x;
  }
}

function syncPartInterfaceIds(doc: DocumentModel): void {
  for (const entity of Object.values(doc.entities)) {
    if (isPart(entity)) {
      entity.interfaceIds = [];
    }
  }

  for (const entityId of doc.order) {
    const entity = doc.entities[entityId];
    if (!isInterface(entity)) {
      continue;
    }

    const parent = doc.entities[entity.parentPartId];
    if (isPart(parent)) {
      parent.interfaceIds.push(entity.id);
    }
  }
}

export function deriveConnectorKind(doc: DocumentModel, connector: ConnectorEntity): ConnectorKind {
  const source = doc.entities[connector.source.interfaceId];
  const target = doc.entities[connector.target.interfaceId];

  if (!isInterface(source) || !isInterface(target)) {
    return "external";
  }

  return source.parentPartId === target.parentPartId ? "internal" : "external";
}

function endpointCandidates(
  doc: DocumentModel,
  connector: ConnectorEntity,
  endpoint: "source" | "target",
  interfaceEntity: InterfaceEntity,
  kind: ConnectorKind,
): Side[] {
  const snapSide = interfaceEntity.snap.attachedToPartEdge;
  const preferred = connector[endpoint].preferredSide;

  if (kind === "external" && snapSide) {
    return [snapSide];
  }

  if (preferred !== "auto") {
    return [preferred];
  }

  return [...SIDES];
}

function routeScore(points: Point[], preferredSource: Side | "auto", sourceSide: Side, preferredTarget: Side | "auto", targetSide: Side): number {
  let total = 0;
  let bends = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += manhattanDistance(points[index - 1]!, points[index]!);
  }

  for (let index = 2; index < points.length; index += 1) {
    const prev = points[index - 2]!;
    const current = points[index - 1]!;
    const next = points[index]!;
    if ((prev.x === current.x && current.y === next.y) || (prev.y === current.y && current.x === next.x)) {
      bends += 1;
    }
  }

  const preferencePenalty =
    (preferredSource !== "auto" && preferredSource !== sourceSide ? 36 : 0) +
    (preferredTarget !== "auto" && preferredTarget !== targetSide ? 36 : 0);

  return total + bends * 24 + preferencePenalty;
}

function buildInternalRoute(start: Point, end: Point): Point[] {
  const options: Point[][] = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end],
    [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end],
  ];

  return options
    .map((points) => simplifyOrthogonalPath(points))
    .sort((a, b) => routeScore(a, "auto", "top", "auto", "top") - routeScore(b, "auto", "top", "auto", "top"))[0]!;
}

function getObstacleRectsForConnector(doc: DocumentModel, connector: ConnectorEntity): Rect[] {
  const source = doc.entities[connector.source.interfaceId];
  const target = doc.entities[connector.target.interfaceId];
  const excludedParents = new Set<string>();

  if (isInterface(source)) {
    excludedParents.add(source.parentPartId);
  }

  if (isInterface(target)) {
    excludedParents.add(target.parentPartId);
  }

  const obstacles: Rect[] = [];

  for (const entity of Object.values(doc.entities)) {
    if (!entity.visible) {
      continue;
    }

    if (entity.id === connector.source.interfaceId || entity.id === connector.target.interfaceId) {
      continue;
    }

    if (isPart(entity) && excludedParents.has(entity.id)) {
      continue;
    }

    if (isRectEntity(entity)) {
      obstacles.push(getEntityRect(entity));
    }

    if (isPart(entity)) {
      obstacles.push(getPartLabelRect(doc, entity));
    }
  }

  return obstacles;
}

function buildAStarRoute(start: Point, end: Point, obstacles: Rect[]): Point[] | null {
  const minX = Math.floor((Math.min(start.x, end.x, ...obstacles.map((rect) => rect.x)) - 160) / GRID_SIZE) * GRID_SIZE;
  const minY = Math.floor((Math.min(start.y, end.y, ...obstacles.map((rect) => rect.y)) - 160) / GRID_SIZE) * GRID_SIZE;
  const maxX = Math.ceil(
    (Math.max(start.x, end.x, ...obstacles.map((rect) => rect.x + rect.width)) + 160) / GRID_SIZE,
  ) * GRID_SIZE;
  const maxY = Math.ceil(
    (Math.max(start.y, end.y, ...obstacles.map((rect) => rect.y + rect.height)) + 160) / GRID_SIZE,
  ) * GRID_SIZE;

  const cols = Math.max(1, Math.floor((maxX - minX) / GRID_SIZE));
  const rows = Math.max(1, Math.floor((maxY - minY) / GRID_SIZE));

  if (cols * rows > 40000) {
    return null;
  }

  const cellToPoint = (x: number, y: number): Point => ({
    x: minX + x * GRID_SIZE,
    y: minY + y * GRID_SIZE,
  });

  const pointToCell = (point: Point): Point => ({
    x: Math.round((point.x - minX) / GRID_SIZE),
    y: Math.round((point.y - minY) / GRID_SIZE),
  });

  const startCell = pointToCell(start);
  const endCell = pointToCell(end);
  const obstacleRects = obstacles.map((rect) => inflateRect(rect, ROUTE_CLEARANCE));

  const isBlocked = (cell: Point): boolean => {
    if (cell.x < 0 || cell.y < 0 || cell.x > cols || cell.y > rows) {
      return true;
    }

    if ((cell.x === startCell.x && cell.y === startCell.y) || (cell.x === endCell.x && cell.y === endCell.y)) {
      return false;
    }

    const point = cellToPoint(cell.x, cell.y);
    return obstacleRects.some((rect) => rectContainsPoint(rect, point));
  };

  const open: Array<{ cell: Point; f: number }> = [{ cell: startCell, f: manhattanDistance(startCell, endCell) }];
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[`${startCell.x},${startCell.y}`, 0]]);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const currentKey = `${current.cell.x},${current.cell.y}`;

    if (current.cell.x === endCell.x && current.cell.y === endCell.y) {
      const routeCells: Point[] = [current.cell];
      let lookup = currentKey;

      while (cameFrom.has(lookup)) {
        const previous = cameFrom.get(lookup)!;
        const [x, y] = previous.split(",").map(Number);
        routeCells.unshift({ x, y });
        lookup = previous;
      }

      return simplifyOrthogonalPath(routeCells.map((cell) => cellToPoint(cell.x, cell.y)));
    }

    const neighbors: Point[] = [
      { x: current.cell.x + 1, y: current.cell.y },
      { x: current.cell.x - 1, y: current.cell.y },
      { x: current.cell.x, y: current.cell.y + 1 },
      { x: current.cell.x, y: current.cell.y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (isBlocked(neighbor)) {
        continue;
      }

      const neighborKey = `${neighbor.x},${neighbor.y}`;
      const tentativeG = (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) + GRID_SIZE;

      if (tentativeG >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentativeG);
      const f = tentativeG + manhattanDistance(neighbor, endCell);
      const existing = open.find((item) => item.cell.x === neighbor.x && item.cell.y === neighbor.y);

      if (existing) {
        existing.f = f;
      } else {
        open.push({ cell: neighbor, f });
      }
    }
  }

  return null;
}

function buildConnectorRoute(
  doc: DocumentModel,
  connector: ConnectorEntity,
  sourceInterface: InterfaceEntity,
  targetInterface: InterfaceEntity,
  sourceSide: Side,
  targetSide: Side,
  kind: ConnectorKind,
): Point[] {
  const sourcePoint = getEdgeMidpoint(sourceInterface, sourceSide);
  const targetPoint = getEdgeMidpoint(targetInterface, targetSide);
  const sourceStub = offsetFromSide(sourcePoint, sourceSide, ROUTE_STUB);
  const targetStub = offsetFromSide(targetPoint, targetSide, ROUTE_STUB);

  if (kind === "internal") {
    return simplifyOrthogonalPath([sourcePoint, ...buildInternalRoute(sourceStub, targetStub), targetPoint]);
  }

  const aStarRoute = buildAStarRoute(sourceStub, targetStub, getObstacleRectsForConnector(doc, connector));
  if (aStarRoute) {
    return simplifyOrthogonalPath([sourcePoint, sourceStub, ...aStarRoute, targetStub, targetPoint]);
  }

  return simplifyOrthogonalPath([sourcePoint, ...buildInternalRoute(sourceStub, targetStub), targetPoint]);
}

function recomputeConnector(doc: DocumentModel, connector: ConnectorEntity): void {
  const source = doc.entities[connector.source.interfaceId];
  const target = doc.entities[connector.target.interfaceId];

  if (!isInterface(source) || !isInterface(target)) {
    connector.routing.segments = [];
    return;
  }

  const kind = deriveConnectorKind(doc, connector);
  const sourceSides = endpointCandidates(doc, connector, "source", source, kind);
  const targetSides = endpointCandidates(doc, connector, "target", target, kind);
  let best:
    | {
        sourceSide: Side;
        targetSide: Side;
        route: Point[];
        score: number;
      }
    | null = null;

  for (const sourceSide of sourceSides) {
    for (const targetSide of targetSides) {
      const route = buildConnectorRoute(doc, connector, source, target, sourceSide, targetSide, kind);
      const score = routeScore(
        route,
        connector.source.preferredSide,
        sourceSide,
        connector.target.preferredSide,
        targetSide,
      );

      if (!best || score < best.score) {
        best = { sourceSide, targetSide, route, score };
      }
    }
  }

  if (!best) {
    best = {
      sourceSide: sourceSides[0] ?? "right",
      targetSide: targetSides[0] ?? "left",
      route: buildConnectorRoute(doc, connector, source, target, sourceSides[0] ?? "right", targetSides[0] ?? "left", kind),
      score: Number.POSITIVE_INFINITY,
    };
  }

  connector.source.resolvedSide = best.sourceSide;
  connector.target.resolvedSide = best.targetSide;
  connector.routing.segments = best.route;
}

function normalizeUi(doc: DocumentModel): void {
  doc.ui.selection = unique(doc.ui.selection.filter((id) => Boolean(doc.entities[id])));
  doc.ui.primarySelectionId =
    doc.ui.primarySelectionId && doc.ui.selection.includes(doc.ui.primarySelectionId)
      ? doc.ui.primarySelectionId
      : doc.ui.selection[doc.ui.selection.length - 1] ?? null;
  doc.ui.mode = doc.ui.selection.length > 0 ? "edit" : "review";
  doc.ui.activeTool = doc.ui.activeTool ?? null;
  doc.ui.zoom = isFiniteNumber(doc.ui.zoom) ? clamp(doc.ui.zoom, 0.4, 2.4) : 1;
  doc.ui.gridEnabled = typeof doc.ui.gridEnabled === "boolean" ? doc.ui.gridEnabled : true;
  doc.ui.snapEnabled = typeof doc.ui.snapEnabled === "boolean" ? doc.ui.snapEnabled : true;
}

export function recomputeDocument(doc: DocumentModel): void {
  doc.order = unique(doc.order.filter((entityId) => Boolean(doc.entities[entityId])));

  for (const entityId of Object.keys(doc.entities)) {
    if (!doc.order.includes(entityId)) {
      doc.order.push(entityId);
    }
  }

  syncPartInterfaceIds(doc);

  for (const entity of Object.values(doc.entities)) {
    if (isPart(entity)) {
      clampPartLabel(doc, entity);
    }
  }

  for (const entity of Object.values(doc.entities)) {
    if (!isInterface(entity)) {
      continue;
    }

    entity.localName = entity.localName.trim();
    autoSizeInterface(doc, entity);

    const parent = doc.entities[entity.parentPartId];
    if (isPart(parent)) {
      clampInterfaceWithinParent(doc, entity, parent);
    }
  }

  for (const entity of Object.values(doc.entities)) {
    if (isPart(entity)) {
      clampPartLabel(doc, entity);
    }
  }

  for (const entity of Object.values(doc.entities)) {
    if (isConnector(entity)) {
      entity.textStyle = {
        fontFamily: entity.textStyle?.fontFamily ?? DEFAULT_FONT_FAMILY,
        fontSize: entity.textStyle?.fontSize ?? 14,
        fontWeight: entity.textStyle?.fontWeight ?? 400,
        fill: entity.textStyle?.fill ?? "#111111",
      };
    }
  }

  for (const entity of Object.values(doc.entities)) {
    if (isConnector(entity)) {
      recomputeConnector(doc, entity);
    }
  }

  normalizeUi(doc);
}

export function validateDocument(doc: DocumentModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const entity of Object.values(doc.entities)) {
    if (isInterface(entity)) {
      const parent = doc.entities[entity.parentPartId];
      if (!isPart(parent)) {
        issues.push({
          id: `interface-parent:${entity.id}`,
          level: "error",
          message: `${entity.id} references missing parent ${entity.parentPartId}.`,
        });
      } else if (!rectContainsRect(getEntityRect(parent), getEntityRect(entity))) {
        issues.push({
          id: `interface-bounds:${entity.id}`,
          level: "error",
          message: `${entity.id} is outside parent bounds.`,
        });
      }
    }

    if (isPart(entity)) {
      const expectedInterfaces = Object.values(doc.entities)
        .filter((candidate): candidate is InterfaceEntity => isInterface(candidate) && candidate.parentPartId === entity.id)
        .map((candidate) => candidate.id)
        .sort();
      const stored = [...entity.interfaceIds].sort();

      if (stored.join("|") !== expectedInterfaces.join("|")) {
        issues.push({
          id: `part-interfaces:${entity.id}`,
          level: "error",
          message: `${entity.id} has inconsistent interfaceIds references.`,
        });
      }

      if (!rectContainsRect(getEntityRect(entity), getPartLabelRect(doc, entity))) {
        issues.push({
          id: `part-label:${entity.id}`,
          level: "error",
          message: `${entity.id} label is outside part bounds.`,
        });
      }

      if (entity.width < doc.settings.minPartWidth || entity.height < doc.settings.minPartHeight) {
        issues.push({
          id: `part-size:${entity.id}`,
          level: "error",
          message: `${entity.id} is smaller than the minimum size.`,
        });
      }
    }

    if (isNote(entity) && (entity.width < doc.settings.minNoteWidth || entity.height < doc.settings.minNoteHeight)) {
      issues.push({
        id: `note-size:${entity.id}`,
        level: "error",
        message: `${entity.id} is smaller than the minimum size.`,
      });
    }

    if (
      isInterface(entity) &&
      (entity.width < doc.settings.minInterfaceWidth || entity.height < doc.settings.minInterfaceHeight)
    ) {
      issues.push({
        id: `interface-size:${entity.id}`,
        level: "error",
        message: `${entity.id} is smaller than the minimum auto-size.`,
      });
    }

    if (isConnector(entity)) {
      const source = doc.entities[entity.source.interfaceId];
      const target = doc.entities[entity.target.interfaceId];

      if (!isInterface(source) || !isInterface(target)) {
        issues.push({
          id: `connector-endpoints:${entity.id}`,
          level: "error",
          message: `${entity.id} points to a missing interface.`,
        });
      }

      if (
        !PREFERRED_SIDE_OPTIONS.includes(entity.source.preferredSide) ||
        !PREFERRED_SIDE_OPTIONS.includes(entity.target.preferredSide) ||
        !SIDES.includes(entity.source.resolvedSide) ||
        !SIDES.includes(entity.target.resolvedSide)
      ) {
        issues.push({
          id: `connector-sides:${entity.id}`,
          level: "error",
          message: `${entity.id} has an invalid connector side value.`,
        });
      }

      if (!ARROW_HEAD_OPTIONS.includes(entity.direction.arrowHeadSide)) {
        issues.push({
          id: `connector-arrow:${entity.id}`,
          level: "error",
          message: `${entity.id} has an invalid arrow head side.`,
        });
      }

      if (!isOrthogonalConnectorRoute(entity.routing.segments)) {
        issues.push({
          id: `connector-route:${entity.id}`,
          level: "error",
          message: `${entity.id} must use only orthogonal segments with 90-degree bends.`,
        });
      }

      const derivedKind = deriveConnectorKind(doc, entity);
      const actualKind = source && target && isInterface(source) && isInterface(target) && source.parentPartId === target.parentPartId
        ? "internal"
        : "external";

      if (derivedKind !== actualKind) {
        issues.push({
          id: `connector-kind:${entity.id}`,
          level: "error",
          message: `${entity.id} has a mismatched derived connector kind.`,
        });
      }
    }
  }

  if (!["edit", "review"].includes(doc.ui.mode)) {
    issues.push({
      id: "ui-mode",
      level: "error",
      message: "ui.mode must be edit or review.",
    });
  }

  if (doc.ui.primarySelectionId && !doc.ui.selection.includes(doc.ui.primarySelectionId)) {
    issues.push({
      id: "ui-primarySelection",
      level: "error",
      message: "primarySelectionId must be null or a member of ui.selection.",
    });
  }

  return issues;
}

export function createValidatedDocument(doc: DocumentModel): { doc: DocumentModel; issues: ValidationIssue[] } {
  const next = clone(doc);
  recomputeDocument(next);
  return { doc: next, issues: validateDocument(next) };
}

export function addPart(doc: DocumentModel, x = 160, y = 140): string {
  const part = createDefaultPart(doc, x, y);
  doc.entities[part.id] = part;
  doc.order.push(part.id);
  return part.id;
}

export function addInterface(doc: DocumentModel, parentPartId: string): string | null {
  return addInterfaceWithOptions(doc, parentPartId);
}

export function addInterfaceWithOptions(
  doc: DocumentModel,
  parentPartId: string,
  options?: {
    localName?: string;
    side?: Side;
    x?: number;
    y?: number;
  },
): string | null {
  const parent = doc.entities[parentPartId];

  if (!isPart(parent)) {
    return null;
  }

  const defaultPosition = options?.side
    ? getInterfacePositionOnPartEdge(parent, options.side)
    : { x: options?.x ?? parent.x + 24, y: options?.y ?? parent.y + 56 };
  const interfaceEntity = createDefaultInterface(doc, parent.id, defaultPosition.x, defaultPosition.y);
  interfaceEntity.localName = options?.localName?.trim() || interfaceEntity.localName;
  interfaceEntity.snap.attachedToPartEdge = options?.side ?? null;
  doc.entities[interfaceEntity.id] = interfaceEntity;
  doc.order.push(interfaceEntity.id);
  return interfaceEntity.id;
}

export function addConnector(doc: DocumentModel, sourceId: string, targetId: string): string {
  const connector = createDefaultConnector(doc, sourceId, targetId);
  doc.entities[connector.id] = connector;
  doc.order.push(connector.id);
  return connector.id;
}

function getEndpointPart(doc: DocumentModel, endpoint: ConnectorCreationEndpoint): PartEntity | null {
  const entity = doc.entities[endpoint.id];

  if (endpoint.kind === "part") {
    return isPart(entity) ? entity : null;
  }

  if (!isInterface(entity)) {
    return null;
  }

  const parent = doc.entities[entity.parentPartId];
  return isPart(parent) ? parent : null;
}

function ensureExternalInterface(
  doc: DocumentModel,
  part: PartEntity,
  otherPart: PartEntity,
  side: Side,
): string | null {
  const desiredLocalName = otherPart.partId.trim() || "interface";
  const existing = part.interfaceIds
    .map((interfaceId) => doc.entities[interfaceId])
    .find((entity): entity is InterfaceEntity => isInterface(entity) && entity.localName.trim() === desiredLocalName);

  if (existing) {
    existing.localName = desiredLocalName;
    existing.snap.attachedToPartEdge = side;
    const position = getInterfacePositionOnPartEdge(part, side);
    existing.x = position.x;
    existing.y = position.y;
    return existing.id;
  }

  return addInterfaceWithOptions(doc, part.id, {
    localName: desiredLocalName,
    side,
  });
}

export function createConnectorFromEndpoints(
  doc: DocumentModel,
  sourceEndpoint: ConnectorCreationEndpoint,
  targetEndpoint: ConnectorCreationEndpoint,
): string | null {
  const sourceEntity = doc.entities[sourceEndpoint.id];
  const targetEntity = doc.entities[targetEndpoint.id];

  if (sourceEndpoint.kind === "interface" && targetEndpoint.kind === "interface") {
    return isInterface(sourceEntity) && isInterface(targetEntity) ? addConnector(doc, sourceEntity.id, targetEntity.id) : null;
  }

  const sourcePart = getEndpointPart(doc, sourceEndpoint);
  const targetPart = getEndpointPart(doc, targetEndpoint);
  if (!sourcePart || !targetPart) {
    return null;
  }

  if (sourcePart.id === targetPart.id && (sourceEndpoint.kind === "part" || targetEndpoint.kind === "part")) {
    return null;
  }

  const sourceSide = chooseSideTowardOtherPart(sourcePart, targetPart);
  const targetSide = oppositeSide(sourceSide);

  let sourceInterfaceId: string | null = null;
  let targetInterfaceId: string | null = null;

  if (sourceEndpoint.kind === "part") {
    sourceInterfaceId = ensureExternalInterface(doc, sourcePart, targetPart, sourceSide);
  } else if (isInterface(sourceEntity)) {
    sourceEntity.localName = targetPart.partId.trim() || sourceEntity.localName;
    sourceInterfaceId = sourceEntity.id;
  }

  if (targetEndpoint.kind === "part") {
    targetInterfaceId = ensureExternalInterface(doc, targetPart, sourcePart, targetSide);
  } else if (isInterface(targetEntity)) {
    targetEntity.localName = sourcePart.partId.trim() || targetEntity.localName;
    targetInterfaceId = targetEntity.id;
  }

  if (!sourceInterfaceId || !targetInterfaceId) {
    return null;
  }

  return addConnector(doc, sourceInterfaceId, targetInterfaceId);
}

export function addNote(doc: DocumentModel, x = 980, y = 220): string {
  const note = createDefaultNote(doc, x, y);
  doc.entities[note.id] = note;
  doc.order.push(note.id);
  return note.id;
}

function connectorsTouchingInterfaces(doc: DocumentModel, interfaceIds: Set<string>): string[] {
  return Object.values(doc.entities)
    .filter(
      (entity): entity is ConnectorEntity =>
        isConnector(entity) &&
        (interfaceIds.has(entity.source.interfaceId) || interfaceIds.has(entity.target.interfaceId)),
    )
    .map((entity) => entity.id);
}

export function deleteSelection(doc: DocumentModel): void {
  const selection = new Set(doc.ui.selection);
  const interfaceIdsToDelete = new Set<string>();
  const idsToDelete = new Set<string>(selection);

  for (const selectedId of selection) {
    const entity = doc.entities[selectedId];
    if (!entity) {
      continue;
    }

    if (isPart(entity)) {
      for (const interfaceId of entity.interfaceIds) {
        interfaceIdsToDelete.add(interfaceId);
        idsToDelete.add(interfaceId);
      }
    }

    if (isInterface(entity)) {
      interfaceIdsToDelete.add(entity.id);
    }
  }

  for (const connectorId of connectorsTouchingInterfaces(doc, interfaceIdsToDelete)) {
    idsToDelete.add(connectorId);
  }

  for (const entityId of idsToDelete) {
    delete doc.entities[entityId];
  }

  doc.order = doc.order.filter((entityId) => !idsToDelete.has(entityId));
  doc.ui.selection = [];
  doc.ui.primarySelectionId = null;
  doc.ui.activeTool = null;
}

export function reverseConnectorDirection(connector: ConnectorEntity): void {
  const currentSource = clone(connector.source);
  connector.source = clone(connector.target);
  connector.target = currentSource;

  const arrowMap: Record<ArrowHeadSide, ArrowHeadSide> = {
    none: "none",
    source: "target",
    target: "source",
    both: "both",
  };

  connector.direction.arrowHeadSide = arrowMap[connector.direction.arrowHeadSide];
}

export function resizeRectFromEdge(
  rect: Rect,
  edge: Side,
  dx: number,
  dy: number,
  minWidth: number,
  minHeight: number,
): void {
  if (edge === "left") {
    const nextX = rect.x + dx;
    const nextWidth = rect.width - dx;
    if (nextWidth >= minWidth) {
      rect.x = nextX;
      rect.width = nextWidth;
    }
  }

  if (edge === "right") {
    const nextWidth = rect.width + dx;
    if (nextWidth >= minWidth) {
      rect.width = nextWidth;
    }
  }

  if (edge === "top") {
    const nextY = rect.y + dy;
    const nextHeight = rect.height - dy;
    if (nextHeight >= minHeight) {
      rect.y = nextY;
      rect.height = nextHeight;
    }
  }

  if (edge === "bottom") {
    const nextHeight = rect.height + dy;
    if (nextHeight >= minHeight) {
      rect.height = nextHeight;
    }
  }
}

export function wrapText(
  text: string,
  options: {
    maxWidth: number;
    fontSize: number;
    fontFamily: string;
    fontWeight?: number;
  },
): string[] {
  const sourceLines = text.split("\n");
  const wrapped: string[] = [];

  for (const sourceLine of sourceLines) {
    const words = sourceLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push("");
      continue;
    }

    let currentLine = words[0]!;
    for (let index = 1; index < words.length; index += 1) {
      const nextLine = `${currentLine} ${words[index]}`;
      if (measureTextWidth(nextLine, options) <= options.maxWidth) {
        currentLine = nextLine;
      } else {
        wrapped.push(currentLine);
        currentLine = words[index]!;
      }
    }
    wrapped.push(currentLine);
  }

  return wrapped;
}

export function getConnectorLabelPoint(connector: ConnectorEntity): Point | null {
  if (connector.routing.segments.length === 0) {
    return null;
  }

  const midIndex = Math.floor(connector.routing.segments.length / 2);
  return connector.routing.segments[midIndex] ?? null;
}

export function getConnectorLabelRect(connector: ConnectorEntity): Rect | null {
  const point = getConnectorLabelPoint(connector);
  if (!point || !connector.content.trim()) {
    return null;
  }

  const width = measureTextWidth(connector.content, {
    fontSize: connector.textStyle.fontSize,
    fontFamily: connector.textStyle.fontFamily,
    fontWeight: connector.textStyle.fontWeight,
  }) + 16;
  const height = connector.textStyle.fontSize * 1.25 + 8;
  return {
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height,
  };
}

export function getConnectorRenderedBounds(doc: DocumentModel, connector: ConnectorEntity): Rect | null {
  const routeRect = rectFromPoints(connector.routing.segments);
  const labelRect = getConnectorLabelRect(connector);
  const arrowPadding = resolveConnectorArrowSize(doc, connector);
  const rects = [routeRect ? inflateRect(routeRect, arrowPadding) : null, labelRect].filter(Boolean) as Rect[];

  return rects.length > 0 ? unionRects(rects) : null;
}

export function getRenderedBounds(doc: DocumentModel, entityIds?: string[]): Rect {
  const ids = entityIds ?? doc.order;
  const rects: Rect[] = [];

  for (const entityId of ids) {
    const entity = doc.entities[entityId];
    if (!entity || !entity.visible) {
      continue;
    }

    if (isRectEntity(entity)) {
      rects.push(getEntityRect(entity));
    }

    if (isPart(entity)) {
      rects.push(getPartLabelRect(doc, entity));
    }

    if (isConnector(entity)) {
      const connectorRect = getConnectorRenderedBounds(doc, entity);
      if (connectorRect) {
        rects.push(connectorRect);
      }
    }
  }

  return unionRects(rects);
}

export function getDocumentBounds(doc: DocumentModel): Rect {
  return getRenderedBounds(doc);
}

function serializableUi(doc: DocumentModel["ui"]): DocumentModel["ui"] {
  return {
    ...doc,
    selection: [],
    primarySelectionId: null,
    hoveredId: null,
    cursorCanvasPosition: null,
    mode: "review",
    activeTool: null,
  };
}

function exportableUi(doc: DocumentModel["ui"]): DocumentModel["ui"] {
  return {
    ...doc,
    hoveredId: null,
    cursorCanvasPosition: null,
    activeTool: null,
  };
}

function isEntityType(value: unknown): value is Entity["type"] {
  return value === "part" || value === "interface" || value === "connector" || value === "note";
}

function isValidEntityId(type: Entity["type"], id: unknown): id is string {
  return typeof id === "string" && id.startsWith(`${type}:`) && id.length > `${type}:`.length;
}

function assertValidSerializedDocument(raw: DocumentModel): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid document payload.");
  }

  if (!raw.settings || !raw.entities || !raw.order || !raw.ui) {
    throw new Error("Invalid document payload.");
  }

  const entities = raw.entities as Record<string, unknown>;

  for (const [entityId, candidate] of Object.entries(entities)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Entity ${entityId} is malformed.`);
    }

    const entity = candidate as Record<string, unknown>;
    if (!isEntityType(entity.type)) {
      throw new Error(`Entity ${entityId} has an invalid type.`);
    }

    if (entity.id !== entityId) {
      throw new Error(`Entity ${entityId} must match its record key.`);
    }

    if (!isValidEntityId(entity.type, entity.id)) {
      throw new Error(`Entity ${entityId} has a malformed id.`);
    }
  }

  for (const candidate of Object.values(entities)) {
    const entity = candidate as Record<string, unknown> & {
      id: string;
      type: Entity["type"];
      interfaceIds?: unknown;
      parentPartId?: unknown;
      source?: { interfaceId?: unknown };
      target?: { interfaceId?: unknown };
    };

    if (entity.type === "part") {
      if (!Array.isArray(entity.interfaceIds)) {
        throw new Error(`${entity.id} must store interfaceIds as an array.`);
      }

      for (const interfaceId of entity.interfaceIds) {
        const interfaceEntity = entities[String(interfaceId)] as Record<string, unknown> | undefined;
        if (!interfaceEntity || interfaceEntity.type !== "interface") {
          throw new Error(`${entity.id} references missing interface ${String(interfaceId)}.`);
        }
        if (interfaceEntity.parentPartId !== entity.id) {
          throw new Error(`${entity.id} references interface ${String(interfaceId)} with the wrong parent.`);
        }
      }
    }

    if (entity.type === "interface") {
      const parent = entities[String(entity.parentPartId)] as Record<string, unknown> | undefined;
      if (!parent || parent.type !== "part") {
        throw new Error(`${entity.id} references missing parent ${String(entity.parentPartId)}.`);
      }
    }

    if (entity.type === "connector") {
      const source = entities[String(entity.source?.interfaceId)] as Record<string, unknown> | undefined;
      const target = entities[String(entity.target?.interfaceId)] as Record<string, unknown> | undefined;
      if (!source || source.type !== "interface" || !target || target.type !== "interface") {
        throw new Error(`${entity.id} points to a missing interface.`);
      }
    }
  }

  if (!Array.isArray(raw.order) || raw.order.some((entityId) => typeof entityId !== "string" || !entities[entityId])) {
    throw new Error("Document order contains a malformed or missing entity reference.");
  }

  if (!Array.isArray(raw.ui.selection) || raw.ui.selection.some((entityId) => typeof entityId !== "string" || !entities[entityId])) {
    throw new Error("ui.selection contains a malformed entity reference.");
  }

  if (
    raw.ui.primarySelectionId !== null &&
    (typeof raw.ui.primarySelectionId !== "string" || !raw.ui.selection.includes(raw.ui.primarySelectionId))
  ) {
    throw new Error("ui.primarySelectionId must be null or a member of ui.selection.");
  }
}

export function persistDocument(doc: DocumentModel): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: DocumentModel = {
    ...doc,
    ui: serializableUi(doc.ui),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadStoredDocument(): DocumentModel | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DocumentModel;
    return deserializeDocument(parsed);
  } catch {
    return null;
  }
}

export function deserializeDocument(raw: DocumentModel): DocumentModel {
  assertValidSerializedDocument(raw);
  const doc = clone(raw);
  recomputeDocument(doc);
  const errors = validateDocument(doc).filter((issue) => issue.level === "error");
  if (errors.length > 0) {
    throw new Error(errors[0]!.message);
  }
  return doc;
}

export function exportDocument(doc: DocumentModel): string {
  const payload: DocumentModel = {
    ...doc,
    ui: serializableUi(doc.ui),
  };
  return JSON.stringify(payload, null, 2);
}

export function exportSavedDocument(doc: DocumentModel): string {
  const payload: DocumentModel = {
    ...doc,
    ui: exportableUi(doc.ui),
  };
  return JSON.stringify(payload, null, 2);
}
