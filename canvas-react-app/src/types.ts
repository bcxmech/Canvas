export type EntityType = "part" | "interface" | "connector" | "note";
export type Side = "top" | "right" | "bottom" | "left";
export type Mode = "edit" | "review";
export type ArrowHeadSide = "none" | "source" | "target" | "both";
export type ConnectorKind = "internal" | "external";
export type ConnectorCreationEndpoint = {
  kind: "part" | "interface";
  id: string;
};

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ValidationIssue {
  id: string;
  level: "error" | "warning";
  message: string;
}

export interface Settings {
  arrowSize: number;
  interfaceFillColor: string;
  partIdFontSize: number;
  interfaceFontSize: number;
  snapThreshold: number;
  minPartWidth: number;
  minPartHeight: number;
  minNoteWidth: number;
  minNoteHeight: number;
  minInterfaceWidth: number;
  minInterfaceHeight: number;
}

export interface BaseEntity {
  id: string;
  type: EntityType;
  visible: boolean;
  locked: boolean;
}

export interface PartEntity extends BaseEntity, Rect {
  type: "part";
  partId: string;
  interfaceIds: string[];
  labelPosition: Point;
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  textStyle: {
    partIdFontSize: number | null;
  };
  childDefaults: {
    interfaceFontSize: number | null;
    interfaceFillColor: string | null;
  };
}

export interface InterfaceEntity extends BaseEntity, Rect {
  type: "interface";
  parentPartId: string;
  localName: string;
  layout: {
    paddingX: number;
    paddingY: number;
    lineHeight: number;
    maxWidth: number;
  };
  textStyle: {
    fontFamily: string;
    fontSize: number | null;
    fontWeight: number;
    fill: string;
  };
  style: {
    fill: string | null;
    stroke: string;
    strokeWidth: number;
    cornerRadius: number;
  };
  snap: {
    attachedToPartEdge: Side | null;
  };
}

export interface ConnectorEndpoint {
  interfaceId: string;
  preferredSide: Side | "auto";
  resolvedSide: Side;
}

export interface ConnectorEntity extends BaseEntity {
  type: "connector";
  source: ConnectorEndpoint;
  target: ConnectorEndpoint;
  direction: {
    arrowHeadSide: ArrowHeadSide;
  };
  arrowSizeOverride: number | null;
  content: string;
  style: {
    stroke: string;
    strokeWidth: number;
  };
  textStyle: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    fill: string;
  };
  routing: {
    kind: "orthogonal";
    segments: Point[];
  };
}

export interface NoteEntity extends BaseEntity, Rect {
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

export interface DocumentUI {
  mode: Mode;
  selection: string[];
  primarySelectionId: string | null;
  hoveredId: string | null;
  cursorCanvasPosition: Point | null;
  zoom: number;
  gridEnabled: boolean;
  snapEnabled: boolean;
  activeTool: string | null;
}

export interface DocumentModel {
  settings: Settings;
  entities: Record<string, Entity>;
  order: string[];
  ui: DocumentUI;
}

export const SIDES: Side[] = ["top", "right", "bottom", "left"];
export const PREFERRED_SIDE_OPTIONS: Array<Side | "auto"> = ["auto", "top", "right", "bottom", "left"];
export const ARROW_HEAD_OPTIONS: ArrowHeadSide[] = ["none", "source", "target", "both"];
