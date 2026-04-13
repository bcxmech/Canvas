export type EntityType = "part" | "interface" | "connector" | "note";
export type Side = "top" | "right" | "bottom" | "left";
export type Mode = "edit" | "review";
export type ConnectorKind = "internal" | "external";
export type ArrowHeadSide = "none" | "source" | "target" | "both";

export interface Point {
  x: number;
  y: number;
}

export interface Settings {
  arrowSize: number;
  interfaceArrowSize: number;
  interfaceFillColor: string;
  partIdFontSize: number;
}

export interface BaseEntity {
  id: string;
  type: EntityType;
  visible: boolean;
  locked: boolean;
}

export interface RectEntity extends BaseEntity {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PartEntity extends RectEntity {
  type: "part";
  partId: string;
  interfaceIds: string[];
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  textStyle: {
    partIdFontSize: number;
    interfaceFontSize: number;
    interfaceFillColor: string;
  };
}

export interface InterfaceEntity extends RectEntity {
  type: "interface";
  parentPartId: string;
  interfaceId: string;
  label: string;
  layout: {
    paddingX: number;
    paddingY: number;
    lineHeight: number;
    maxWidth: number;
  };
  textStyle: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fill: string;
  };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  snap: {
    attachedToPartEdge: Side | null;
  };
}

export interface ConnectorEntity extends BaseEntity {
  type: "connector";
  connectorKind: ConnectorKind;
  source: {
    interfaceId: string;
    side: Side;
  };
  target: {
    interfaceId: string;
    side: Side;
  };
  direction: {
    arrowHeadSide: ArrowHeadSide;
  };
  content: string;
  style: {
    stroke: string;
    strokeWidth: number;
  };
  routing: {
    kind: "orthogonal";
    segments: Point[];
  };
}

export interface NoteEntity extends RectEntity {
  type: "note";
  text: string;
  textStyle: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fill: string;
    lineHeight: number;
  };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    cornerRadius: number;
  };
}

export type Entity = PartEntity | InterfaceEntity | ConnectorEntity | NoteEntity;

export interface DocumentModel {
  settings: Settings;
  entities: Record<string, Entity>;
  order: string[];
  ui: {
    mode: Mode;
    selection: string[];
    hoveredId: string | null;
    zoom: number;
    snapEnabled: boolean;
  };
}

export const defaultDocumentModel: DocumentModel = {
  settings: {
    arrowSize: 12,
    interfaceArrowSize: 10,
    interfaceFillColor: "#ffffff",
    partIdFontSize: 16,
  },
  entities: {},
  order: [],
  ui: {
    mode: "edit",
    selection: [],
    hoveredId: null,
    zoom: 1,
    snapEnabled: true,
  },
};

export function getBounds(entity: RectEntity) {
  return { x: entity.x, y: entity.y, width: entity.width, height: entity.height };
}

export function getCenter(entity: RectEntity): Point {
  return { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 };
}

export function getEdgeMidpoint(entity: RectEntity, side: Side): Point {
  const cx = entity.x + entity.width / 2;
  const cy = entity.y + entity.height / 2;

  switch (side) {
    case "top":
      return { x: cx, y: entity.y };
    case "right":
      return { x: entity.x + entity.width, y: cy };
    case "bottom":
      return { x: cx, y: entity.y + entity.height };
    case "left":
      return { x: entity.x, y: cy };
  }
}

export function getAllEdgeMidpoints(entity: RectEntity): Record<Side, Point> {
  return {
    top: getEdgeMidpoint(entity, "top"),
    right: getEdgeMidpoint(entity, "right"),
    bottom: getEdgeMidpoint(entity, "bottom"),
    left: getEdgeMidpoint(entity, "left"),
  };
}

export function movePart(part: PartEntity, dx: number, dy: number) {
  part.x += dx;
  part.y += dy;
}

export function resizePartFromEdge(
  part: RectEntity,
  edge: Side,
  dx: number,
  dy: number,
  minWidth = 80,
  minHeight = 60,
) {
  if (edge === "left") {
    const nextX = part.x + dx;
    const nextWidth = part.width - dx;
    if (nextWidth >= minWidth) {
      part.x = nextX;
      part.width = nextWidth;
    }
  }

  if (edge === "right") {
    const nextWidth = part.width + dx;
    if (nextWidth >= minWidth) {
      part.width = nextWidth;
    }
  }

  if (edge === "top") {
    const nextY = part.y + dy;
    const nextHeight = part.height - dy;
    if (nextHeight >= minHeight) {
      part.y = nextY;
      part.height = nextHeight;
    }
  }

  if (edge === "bottom") {
    const nextHeight = part.height + dy;
    if (nextHeight >= minHeight) {
      part.height = nextHeight;
    }
  }
}

export function containsRect(parentPart: RectEntity, childEntity: RectEntity) {
  return (
    childEntity.x >= parentPart.x &&
    childEntity.y >= parentPart.y &&
    childEntity.x + childEntity.width <= parentPart.x + parentPart.width &&
    childEntity.y + childEntity.height <= parentPart.y + parentPart.height
  );
}

export function measureTextWidth(
  text: string,
  { fontSize, fontFamily, fontWeight = 400 }: { fontSize: number; fontFamily: string; fontWeight?: number },
) {
  if (typeof document !== "undefined") {
    const canvas =
      (measureTextWidth as typeof measureTextWidth & { canvas?: HTMLCanvasElement }).canvas ||
      ((measureTextWidth as typeof measureTextWidth & { canvas?: HTMLCanvasElement }).canvas =
        document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      return ctx.measureText(text).width;
    }
  }

  // Fallback for non-browser environments.
  return text.length * fontSize * 0.6;
}

export function layoutInterfaceSize(iface: InterfaceEntity) {
  const textWidth = measureTextWidth(iface.label, iface.textStyle);
  const textHeight = iface.textStyle.fontSize * iface.layout.lineHeight;

  iface.width = Math.ceil(Math.min(textWidth, iface.layout.maxWidth) + iface.layout.paddingX * 2);
  iface.height = Math.ceil(textHeight + iface.layout.paddingY * 2);
}

export function moveInterfaceWithinPart(iface: InterfaceEntity, parentPart: PartEntity, dx: number, dy: number) {
  iface.x += dx;
  iface.y += dy;

  iface.x = Math.max(parentPart.x, Math.min(iface.x, parentPart.x + parentPart.width - iface.width));
  iface.y = Math.max(parentPart.y, Math.min(iface.y, parentPart.y + parentPart.height - iface.height));
}

export function maybeSnapInterfaceToPartEdge(iface: InterfaceEntity, parentPart: PartEntity, snapDistance = 12) {
  const distances: Record<Side, number> = {
    top: Math.abs(iface.y - parentPart.y),
    right: Math.abs(parentPart.x + parentPart.width - (iface.x + iface.width)),
    bottom: Math.abs(parentPart.y + parentPart.height - (iface.y + iface.height)),
    left: Math.abs(iface.x - parentPart.x),
  };

  let bestSide: Side | null = null;
  let bestDistance = Infinity;

  for (const side of Object.keys(distances) as Side[]) {
    const distance = distances[side];
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSide = side;
    }
  }

  if (!bestSide || bestDistance > snapDistance) {
    iface.snap.attachedToPartEdge = null;
    return;
  }

  iface.snap.attachedToPartEdge = bestSide;
  if (bestSide === "top") iface.y = parentPart.y;
  if (bestSide === "right") iface.x = parentPart.x + parentPart.width - iface.width;
  if (bestSide === "bottom") iface.y = parentPart.y + parentPart.height - iface.height;
  if (bestSide === "left") iface.x = parentPart.x;
}

export function resolveConnectorEndpointSide(
  iface: InterfaceEntity,
  requestedSide: Side,
  connectorKind: ConnectorKind,
): Side {
  if (connectorKind === "external" && iface.snap?.attachedToPartEdge) {
    return iface.snap.attachedToPartEdge;
  }
  return requestedSide;
}

export function getConnectorEndpoints(doc: DocumentModel, connector: ConnectorEntity) {
  const source = doc.entities[connector.source.interfaceId] as InterfaceEntity;
  const target = doc.entities[connector.target.interfaceId] as InterfaceEntity;

  const sourceSide = resolveConnectorEndpointSide(source, connector.source.side, connector.connectorKind);
  const targetSide = resolveConnectorEndpointSide(target, connector.target.side, connector.connectorKind);

  return {
    start: getEdgeMidpoint(source, sourceSide),
    end: getEdgeMidpoint(target, targetSide),
    sourceSide,
    targetSide,
  };
}

export function reverseConnector(connector: ConnectorEntity) {
  const oldSource = connector.source;
  connector.source = connector.target;
  connector.target = oldSource;

  if (connector.direction.arrowHeadSide === "source") {
    connector.direction.arrowHeadSide = "target";
  } else if (connector.direction.arrowHeadSide === "target") {
    connector.direction.arrowHeadSide = "source";
  }
}

const SIDE_NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

function addPoint(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scalePoint(v: Point, scalar: number): Point {
  return { x: v.x * scalar, y: v.y * scalar };
}

function isRectEntity(entity: Entity): entity is PartEntity | InterfaceEntity | NoteEntity {
  return "x" in entity && "y" in entity && "width" in entity && "height" in entity;
}

function inflateRect(rect: RectEntity, margin: number): RectEntity {
  return {
    ...rect,
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

function isPointInsideRect(point: Point, rect: RectEntity) {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}

function segmentIntersectsRect(a: Point, b: Point, rect: RectEntity): boolean {
  if (a.x === b.x) {
    const x = a.x;
    if (x <= rect.x || x >= rect.x + rect.width) return false;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return maxY > rect.y && minY < rect.y + rect.height;
  }

  if (a.y === b.y) {
    const y = a.y;
    if (y <= rect.y || y >= rect.y + rect.height) return false;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return maxX > rect.x && minX < rect.x + rect.width;
  }

  return false;
}

function countTurns(points: Point[]) {
  let turns = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    const next = points[i + 1];
    const incomingHorizontal = prev.y === current.y;
    const outgoingHorizontal = current.y === next.y;
    if (incomingHorizontal !== outgoingHorizontal) {
      turns += 1;
    }
  }
  return turns;
}

function routeLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return total;
}

function simplifyCollinear(points: Point[]) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const current = points[i];
    const next = points[i + 1];
    if ((prev.x === current.x && current.x === next.x) || (prev.y === current.y && current.y === next.y)) {
      continue;
    }
    out.push(current);
  }
  out.push(points[points.length - 1]);
  return out;
}

function buildCandidates(startStub: Point, endStub: Point): Point[][] {
  const hv: Point[] = [startStub, { x: endStub.x, y: startStub.y }, endStub];
  const vh: Point[] = [startStub, { x: startStub.x, y: endStub.y }, endStub];

  const minX = Math.min(startStub.x, endStub.x);
  const maxX = Math.max(startStub.x, endStub.x);
  const minY = Math.min(startStub.y, endStub.y);
  const maxY = Math.max(startStub.y, endStub.y);
  const gutter = 24;

  return [
    hv,
    vh,
    [startStub, { x: minX - gutter, y: startStub.y }, { x: minX - gutter, y: endStub.y }, endStub],
    [startStub, { x: maxX + gutter, y: startStub.y }, { x: maxX + gutter, y: endStub.y }, endStub],
    [startStub, { x: startStub.x, y: minY - gutter }, { x: endStub.x, y: minY - gutter }, endStub],
    [startStub, { x: startStub.x, y: maxY + gutter }, { x: endStub.x, y: maxY + gutter }, endStub],
  ];
}

function intersectsAnyObstacle(polyline: Point[], obstacles: RectEntity[]) {
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1];
    const b = polyline[i];
    for (const obstacle of obstacles) {
      if (isPointInsideRect(a, obstacle) || isPointInsideRect(b, obstacle) || segmentIntersectsRect(a, b, obstacle)) {
        return true;
      }
    }
  }
  return false;
}

export function chooseBestConnectorRoute(doc: DocumentModel, connector: ConnectorEntity): Point[] {
  const endpoints = getConnectorEndpoints(doc, connector);
  const stubLength = 16;
  const startStub = addPoint(endpoints.start, scalePoint(SIDE_NORMALS[endpoints.sourceSide], stubLength));
  const endStub = addPoint(endpoints.end, scalePoint(SIDE_NORMALS[endpoints.targetSide], stubLength));

  const basePath = [endpoints.start, startStub];
  const finalPath = [endStub, endpoints.end];
  const candidates = buildCandidates(startStub, endStub);

  const obstacleMargin = 8;
  const obstacles: RectEntity[] = [];
  if (connector.connectorKind === "external") {
    for (const entityId of Object.keys(doc.entities)) {
      const entity = doc.entities[entityId];
      if (!isRectEntity(entity)) continue;
      if (entity.id === connector.source.interfaceId || entity.id === connector.target.interfaceId) continue;
      if (entity.type !== "part" && entity.type !== "interface" && entity.type !== "note") continue;
      obstacles.push(inflateRect(entity, obstacleMargin));
    }
  }

  let best: Point[] | null = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const polyline = simplifyCollinear([...basePath, ...candidate.slice(1, -1), ...finalPath]);
    if (connector.connectorKind === "external" && intersectsAnyObstacle(polyline, obstacles)) {
      continue;
    }

    const score = routeLength(polyline) + countTurns(polyline) * 32;
    if (score < bestScore) {
      best = polyline;
      bestScore = score;
    }
  }

  return best ?? simplifyCollinear([...basePath, ...finalPath]);
}

export function rerouteConnector(doc: DocumentModel, connectorId: string) {
  const entity = doc.entities[connectorId];
  if (!entity || entity.type !== "connector") return;
  entity.routing.segments = chooseBestConnectorRoute(doc, entity);
}

export function normalizeDrawOrder(doc: DocumentModel) {
  const priority: Record<EntityType, number> = {
    part: 0,
    interface: 1,
    note: 2,
    connector: 3,
  };

  doc.order.sort((a, b) => {
    const left = doc.entities[a];
    const right = doc.entities[b];
    if (!left || !right) return 0;
    return priority[left.type] - priority[right.type];
  });
}

export function moveNote(note: NoteEntity, dx: number, dy: number) {
  note.x += dx;
  note.y += dy;
}

export function resizeNoteFromEdge(note: NoteEntity, edge: Side, dx: number, dy: number, minWidth = 80, minHeight = 40) {
  resizePartFromEdge(note, edge, dx, dy, minWidth, minHeight);
}

export function makeInterfaceId(partId: string, index: number) {
  return `${partId}_inf${index}`;
}

export function makePartPairRelationshipName(sourcePartId: string, targetPartId: string) {
  return `${sourcePartId}_${targetPartId}`;
}

export const handlers = {
  part: {
    getBounds,
    getEdgeMidpoint,
    move: movePart,
    resizeFromEdge: resizePartFromEdge,
  },
  interface: {
    getBounds,
    getEdgeMidpoint,
    layout: layoutInterfaceSize,
    moveWithinParent: moveInterfaceWithinPart,
    maybeSnapToParentEdge: maybeSnapInterfaceToPartEdge,
  },
  note: {
    getBounds,
    getEdgeMidpoint,
    move: moveNote,
    resizeFromEdge: resizeNoteFromEdge,
  },
  connector: {
    getEndpoints: getConnectorEndpoints,
    reverse: reverseConnector,
    chooseRoute: chooseBestConnectorRoute,
    reroute: rerouteConnector,
  },
};
