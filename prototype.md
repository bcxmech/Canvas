# Diagram Model Prototype (Canonical)

This prototype is the canonical model/rules companion to `requirements.md` and `UI.md`.

## 1) Document model

```js
const DocumentModel = {
  settings: {
    arrowSize: 12,
    interfaceArrowSize: 10,
    interfaceFillColor: "#ffffff",
    partIdFontSize: 16
  },

  entities: {},
  order: [],

  ui: {
    mode: "edit",              // "edit" | "review"
    selection: [],
    hoveredId: null,
    zoom: 1,
    snapEnabled: true,
    activeTool: null
  }
}
```

## 2) Connector prototype and behavior

```js
const ConnectorEntity = {
  id: "connector:c1",
  type: "connector",

  connectorKind: "external",    // "internal" | "external"

  source: { interfaceId: "interface:partA_inf1", side: "right" },
  target: { interfaceId: "interface:partB_inf1", side: "left" },

  direction: {
    arrowHeadSide: "target"      // "none" | "source" | "target" | "both"
  },

  style: { stroke: "#222222", strokeWidth: 2 },
  routing: { kind: "orthogonal", segments: [] }
}
```

### Reversal rule
Only direction is reversible:

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
}
```

## 3) Interaction prototypes

### 3.1 Zoom and pan input

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

### 3.2 Esc behavior

```js
function handleEscToReviewMode(doc) {
  doc.ui.activeTool = null
  doc.ui.selection = []
  doc.ui.mode = "review"
}
```

## 4) Connector endpoint/routing prototypes

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

function updateConnectorEndpointsAfterMove(doc, connectorId) {
  const c = doc.entities[connectorId]
  const source = doc.entities[c.source.interfaceId]
  const target = doc.entities[c.target.interfaceId]

  c.source.side = chooseDynamicEndpointSide(source, getCenter(target))
  c.target.side = chooseDynamicEndpointSide(target, getCenter(source))
  c.routing.segments = chooseBestConnectorRoute(doc, c)
}
```

### Routing contract

```js
function chooseBestConnectorRoute(doc, connector) {
  // 1) generate orthogonal candidates
  // 2) drop candidates that violate endpoint/containment rules
  // 3) for external connectors: reject candidates crossing other entities
  // 4) for internal connectors: crossings are allowed
  // 5) score by bends + length + clearance
  // 6) return best route segments
}
```

## 5) Geometry helpers (shared)

```js
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
