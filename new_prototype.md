# Canvas Diagram Prototype (Unified)

This unified prototype merges the previous `prototype.md` and `diagram-model-prototypes.md` into one canonical, model-first reference aligned to `requirements.md` and `UI.md`.

CTQ alignment note: this prototype explicitly encodes commit-on-edit-finish behavior, right-pane exclusivity, attribute scoping, immediate rerender, and connector rerouting invariants from `CTQs.md`.

## 1) Canonical document model

```js
const DocumentModel = {
  settings: {
    arrowSize: 12,
    interfaceArrowSize: 10,
    interfaceFillColor: "#ffffff",
    partIdFontSize: 16
  },

  entities: {
    // [entityId]: BaseEntity subtype
  },

  // Deterministic draw order
  order: [],

  ui: {
    mode: "edit",              // "edit" | "review"
    selection: [],              // string[]
    hoveredId: null,            // string | null
    zoom: 1,
    snapEnabled: true,
    activeTool: null            // string | null
  }
}
```

### UI-mode contract
- Exactly one UI mode is active at a time: `edit` XOR `review`.
- Pressing `Esc` interrupts active tools, clears selection, and switches to `review`.
- Review mode shows document settings before the canvas summary block.

---

## 2) Shared entity prototypes

### 2.1 Base entity

```js
const BaseEntity = {
  id: "entity:1",
  type: "part",               // "part" | "interface" | "connector" | "note"
  visible: true,
  locked: false
}
```

### 2.2 Rectangular entity base

```js
const RectEntity = {
  ...BaseEntity,
  x: 0,
  y: 0,
  width: 0,
  height: 0
}
```

---

## 3) Concrete entity prototypes

### 3.1 Part

```js
const PartEntity = {
  id: "part:partA",
  type: "part",

  x: 100,
  y: 80,
  width: 280,
  height: 180,

  partId: "partA",
  interfaceIds: ["interface:partA_inf1"],

  style: {
    fill: "#ffffff",
    stroke: "#222222",
    strokeWidth: 2,
    cornerRadius: 8
  },

  textStyle: {
    partIdFontSize: 16,
    interfaceFontSize: 14,
    interfaceFillColor: "#ffffff"
  },

  visible: true,
  locked: false
}
```

Part behavior requirements:
- Movable and edge-resizable with minimum dimensions.
- Child interfaces must remain fully contained after move/resize operations.

### 3.2 Interface

```js
const InterfaceEntity = {
  id: "interface:partA_inf1",
  type: "interface",

  parentPartId: "part:partA",
  interfaceId: "partA_inf1",
  label: "partA_inf1",

  x: 120,
  y: 120,
  width: 120,
  height: 28,

  layout: {
    paddingX: 10,
    paddingY: 6,
    lineHeight: 1.2,
    maxWidth: 220
  },

  textStyle: {
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    fill: "#111111"
  },

  style: {
    fill: "#ffffff",
    stroke: "#222222",
    strokeWidth: 1,
    cornerRadius: 6
  },

  snap: {
    attachedToPartEdge: null     // null | "top" | "right" | "bottom" | "left"
  },

  visible: true,
  locked: false
}
```

Interface behavior requirements:
- Belongs to exactly one part.
- Size is text-derived (no manual resize).
- Movement is constrained to parent bounds.
- Supports edge snapping to parent part edges.

### 3.3 Connector

```js
const ConnectorEntity = {
  id: "connector:c1",
  type: "connector",

  connectorKind: "external",    // "internal" | "external"

  source: {
    interfaceId: "interface:partA_inf1",
    side: "right"               // "top" | "right" | "bottom" | "left"
  },

  target: {
    interfaceId: "interface:partB_inf1",
    side: "left"
  },

  direction: {
    arrowHeadSide: "target"     // "none" | "source" | "target" | "both"
  },

  content: "",

  style: {
    stroke: "#222222",
    strokeWidth: 2
  },

  routing: {
    kind: "orthogonal",
    segments: []
  },

  visible: true,
  locked: false
}
```

Connector creation flow:
1. Select `source.interfaceId`.
2. Select `target.interfaceId`.
3. Resolve endpoint sides and compute initial orthogonal route.
4. Persist connector in `entities` and append id to `order`.

### 3.4 Note

```js
const NoteEntity = {
  id: "note:n1",
  type: "note",

  x: 520,
  y: 120,
  width: 180,
  height: 100,

  text: "Review this interface mapping.",

  textStyle: {
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    fill: "#111111",
    lineHeight: 1.3
  },

  style: {
    fill: "#fff7cc",
    stroke: "#222222",
    strokeWidth: 1,
    cornerRadius: 6
  },

  visible: true,
  locked: false
}
```

Note behavior requirements:
- Movable and edge-resizable with minimum dimensions.

---

## 4) Interaction prototypes

### 4.0 Edit commit pipeline (no Apply button)

```js
function commitEdit(doc, patch, ctx) {
  // ctx = { entityId?, fieldPath, source: "pane" | "canvas", finishedBy }
  // finishedBy: "blur" | "enter" | "picker-close" | "drag-end"
  const next = structuredClone(doc)
  const normalized = normalizeEditValue(ctx.fieldPath, patch.value)

  enforceFieldConstraintsOrThrow(next, ctx, normalized)
  applyScopedPatch(next, ctx, normalized)

  recomputeAutosize(next, ctx)
  recomputeContainmentAndSnap(next, ctx)
  recomputeConnectorEndpointsAndRoutes(next, ctx)
  refreshReviewSummary(next)

  return next
}
```

Contract:
- No explicit Apply action is required for pane edits.
- Commit occurs at edit-finish boundaries only.
- Post-commit render reflects model changes immediately with no stale values.

### 4.1 Zoom and pan input

```js
function onCanvasWheelZoom(doc, event) {
  const zoomStep = event.deltaY < 0 ? 1.1 : 0.9
  doc.ui.zoom = Math.max(0.2, Math.min(4, doc.ui.zoom * zoomStep))
}

function onMiddleMousePanStart(doc, event) {
  if (event.button !== 1) return
  doc.ui.activeTool = "pan"
}

function onMiddleMousePanEnd(doc) {
  if (doc.ui.activeTool === "pan") doc.ui.activeTool = null
}
```

### 4.2 Selection and right-pane targeting

```js
function onSelectEntity(doc, entityId) {
  doc.ui.selection = entityId ? [entityId] : []
  doc.ui.mode = entityId ? "edit" : "review"
  // right pane retargets immediately to selected entity
}
```

### 4.3 Esc behavior (mode + tool reset)

```js
function handleEscToReviewMode(doc) {
  doc.ui.activeTool = null
  doc.ui.selection = []
  doc.ui.mode = "review"
}
```

### 4.4 Input validity guards

```js
function enforceFieldConstraintsOrThrow(doc, ctx, value) {
  if (ctx.fieldPath.endsWith(".width") || ctx.fieldPath.endsWith(".height")) {
    if (value < 24) throw new Error("Dimension below minimum")
  }
  if (ctx.fieldPath.endsWith(".source.side") || ctx.fieldPath.endsWith(".target.side")) {
    if (!["top", "right", "bottom", "left"].includes(value)) {
      throw new Error("Invalid connector side")
    }
  }
}
```

---

## 5) Connector endpoint and routing prototypes

### 5.1 Endpoint-side resolution

```js
function resolveConnectorEndpointSide(iface, requestedSide, connectorKind) {
  if (connectorKind === "external" && iface.snap?.attachedToPartEdge) {
    return iface.snap.attachedToPartEdge
  }
  return requestedSide
}

function chooseDynamicEndpointSide(iface, oppositePoint) {
  const mids = getAllEdgeMidpoints(iface)
  return Object.entries(mids)
    .sort(([, a], [, b]) => dist(a, oppositePoint) - dist(b, oppositePoint))[0][0]
}
```

### 5.2 Route update after movement

```js
function updateConnectorEndpointsAfterMove(doc, connectorId) {
  const c = doc.entities[connectorId]
  const source = doc.entities[c.source.interfaceId]
  const target = doc.entities[c.target.interfaceId]

  c.source.side = chooseDynamicEndpointSide(source, getCenter(target))
  c.target.side = chooseDynamicEndpointSide(target, getCenter(source))
  c.routing.segments = chooseBestConnectorRoute(doc, c)
}
```

### 5.3 Routing contract

```js
function chooseBestConnectorRoute(doc, connector) {
  // 1) generate orthogonal candidates
  // 2) drop candidates violating endpoint/containment rules
  // 3) for external connectors: reject candidates crossing entities
  // 4) for internal connectors: crossings are allowed
  // 5) score by bends + length + clearance
  // 6) return best route segments
}
```

---

## 6) Connector reversal prototype

Only connector direction is reversible.

```js
function reverseConnectorDirection(connector) {
  const oldSource = connector.source
  connector.source = connector.target
  connector.target = oldSource

  if (connector.direction.arrowHeadSide === "source") {
    connector.direction.arrowHeadSide = "target"
  } else if (connector.direction.arrowHeadSide === "target") {
    connector.direction.arrowHeadSide = "source"
  }

  // Non-reversed fields remain unchanged:
  // connectorKind, content, style, routing.kind
}
```

---

## 7) Shared geometry helpers

```js
function getBounds(entity) {
  return {
    x: entity.x,
    y: entity.y,
    width: entity.width,
    height: entity.height
  }
}

function getCenter(entity) {
  return { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 }
}

function getAllEdgeMidpoints(entity) {
  const cx = entity.x + entity.width / 2
  const cy = entity.y + entity.height / 2
  return {
    top: { x: cx, y: entity.y },
    right: { x: entity.x + entity.width, y: cy },
    bottom: { x: cx, y: entity.y + entity.height },
    left: { x: entity.x, y: cy }
  }
}

function dist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}
```

---

## 8) Persistence and identity integrity

```js
function serializeDocument(doc) {
  return JSON.stringify(doc)
}

function deserializeDocument(raw) {
  const doc = JSON.parse(raw)
  validateDocument(doc)
  assertUniqueAndWellFormedIds(doc)
  return doc
}
```

---

## 9) UI mapping (from requirements + UI layout)

- Top bar includes File, Edit, View, Zoom, Snap, Validate, Export, and mode toggle.
- Left pane includes Add Part, Add Interface, Add Connector, Add Note, Delete Entity, Reset Canvas.
- Right pane renders exactly one of Edit or Review mode.
- Status bar mirrors `ui` telemetry (`cursor`, `zoom`, `snap`, `hoveredId`, `selection`).
- Interaction lifecycle: validate action -> update model -> recompute derived geometry/routing -> rerender SVG.
- Save/reload preserves committed edits and ID/naming integrity.

This mapping keeps the model-first architecture and deterministic SVG rendering contract intact.
