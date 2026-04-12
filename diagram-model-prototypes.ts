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

export function chooseBestConnectorRoute(_doc: DocumentModel, connector: ConnectorEntity): Point[] {
  return connector.routing.segments;
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
  },
};
