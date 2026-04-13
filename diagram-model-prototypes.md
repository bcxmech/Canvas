# Diagram Model Prototypes (Markdown Spec)

This document is a prototype-style specification where:

- The **document model** is the source of truth.
- **SVG** is only the render layer.
- Rectangular entities share `x/y/width/height`.
- Interfaces auto-size from text.
- Connectors attach through edge midpoints with routing rules.

---

## 1) Core document prototype

```js
const DocumentModel = {
  settings: {
    arrowSize: 12,
    interfaceArrowSize: 10,
    interfaceFillColor: "#ffffff",
    partIdFontSize: 16
  },

  entities: {
    // [entityId]: Entity
  },

  order: [],

  ui: {
    mode: "edit",        // "edit" | "review"
    selection: [],
    hoveredId: null,
    zoom: 1,
    snapEnabled: true
  }
}
```

---

## 2) Shared entity prototypes

### 2.1 Base entity

```js
const BaseEntity = {
  id: "entity:1",
  type: "part",         // "part" | "interface" | "connector" | "note"
  visible: true,
  locked: false
}
```

### 2.2 Rectangular entity

```js
const RectEntity = {
  ...BaseEntity,
  x: 0,
  y: 0,
  width: 0,
  height: 0
}
```

```text
                top midpoint
                     ▲
                     │
          ┌─────────────────────┐
left mid  │                     │  right mid
◄──────── │      rectangle      │ ────────►
          │                     │
          └─────────────────────┘
                     │
                     ▼
               bottom midpoint
```

---

## 3) Entity prototypes

### 3.1 Part prototype

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

### 3.2 Interface prototype

```js
const InterfaceEntity = {
  id: "interface:partA_inf1",
  type: "interface",

  parentPartId: "part:partA",
  interfaceId: "partA_inf1",

  x: 120,
  y: 120,
  width: 120,
  height: 28,

  label: "partA_inf1",

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
    attachedToPartEdge: null // null | "top" | "right" | "bottom" | "left"
  },

  visible: true,
  locked: false
}
```

### 3.3 Connector prototype

```js
const ConnectorEntity = {
  id: "connector:c1",
  type: "connector",

  connectorKind: "external", // "internal" | "external"

  source: {
    interfaceId: "interface:partA_inf1",
    side: "right"            // "top" | "right" | "bottom" | "left"
  },

  target: {
    interfaceId: "interface:partB_inf1",
    side: "left"
  },

  direction: {
    arrowHeadSide: "target"  // "none" | "source" | "target" | "both"
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

Connector creation is initiated from the left-pane `Add Connector` action and follows a guided endpoint flow:
1. pick `source.interfaceId`
2. pick `target.interfaceId`
3. resolve endpoint sides and compute initial orthogonal route
4. persist the connector in `entities` and append its id to `order`

### 3.4 Note prototype

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

---

## 4) Shared function prototypes

### 4.1 Bounds and midpoint functions

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
  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2
  }
}

function getEdgeMidpoint(entity, side) {
  const cx = entity.x + entity.width / 2
  const cy = entity.y + entity.height / 2

  switch (side) {
    case "top":
      return { x: cx, y: entity.y }
    case "right":
      return { x: entity.x + entity.width, y: cy }
    case "bottom":
      return { x: cx, y: entity.y + entity.height }
    case "left":
      return { x: entity.x, y: cy }
    default:
      throw new Error(`Unsupported side: ${side}`)
  }
}

function getAllEdgeMidpoints(entity) {
  return {
    top: getEdgeMidpoint(entity, "top"),
    right: getEdgeMidpoint(entity, "right"),
    bottom: getEdgeMidpoint(entity, "bottom"),
    left: getEdgeMidpoint(entity, "left")
  }
}
```

---

## 5) Part function prototypes

```js
function movePart(part, dx, dy) {
  part.x += dx
  part.y += dy
}

function resizePartFromEdge(part, edge, dx, dy, minWidth = 80, minHeight = 60) {
  if (edge === "left") {
    const nextX = part.x + dx
    const nextWidth = part.width - dx
    if (nextWidth >= minWidth) {
      part.x = nextX
      part.width = nextWidth
    }
  }

  if (edge === "right") {
    const nextWidth = part.width + dx
    if (nextWidth >= minWidth) {
      part.width = nextWidth
    }
  }

  if (edge === "top") {
    const nextY = part.y + dy
    const nextHeight = part.height - dy
    if (nextHeight >= minHeight) {
      part.y = nextY
      part.height = nextHeight
    }
  }

  if (edge === "bottom") {
    const nextHeight = part.height + dy
    if (nextHeight >= minHeight) {
      part.height = nextHeight
    }
  }
}

function containsRect(parentPart, childEntity) {
  return (
    childEntity.x >= parentPart.x &&
    childEntity.y >= parentPart.y &&
    childEntity.x + childEntity.width <= parentPart.x + parentPart.width &&
    childEntity.y + childEntity.height <= parentPart.y + parentPart.height
  )
}
```

---

## 6) Interface function prototypes

```js
function measureTextWidth(text, { fontSize, fontFamily, fontWeight = 400 }) {
  const canvas =
    measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement("canvas"))
  const ctx = canvas.getContext("2d")
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  return ctx.measureText(text).width
}

function layoutInterfaceSize(iface) {
  const textWidth = measureTextWidth(iface.label, iface.textStyle)
  const textHeight = iface.textStyle.fontSize * iface.layout.lineHeight

  iface.width = Math.ceil(textWidth + iface.layout.paddingX * 2)
  iface.height = Math.ceil(textHeight + iface.layout.paddingY * 2)
}

function moveInterfaceWithinPart(iface, parentPart, dx, dy) {
  iface.x += dx
  iface.y += dy

  iface.x = Math.max(parentPart.x, Math.min(iface.x, parentPart.x + parentPart.width - iface.width))
  iface.y = Math.max(parentPart.y, Math.min(iface.y, parentPart.y + parentPart.height - iface.height))
}

function maybeSnapInterfaceToPartEdge(iface, parentPart, snapDistance = 12) {
  const distances = {
    top: Math.abs(iface.y - parentPart.y),
    right: Math.abs((parentPart.x + parentPart.width) - (iface.x + iface.width)),
    bottom: Math.abs((parentPart.y + parentPart.height) - (iface.y + iface.height)),
    left: Math.abs(iface.x - parentPart.x)
  }

  let bestSide = null
  let bestDistance = Infinity

  for (const [side, distance] of Object.entries(distances)) {
    if (distance < bestDistance) {
      bestDistance = distance
      bestSide = side
    }
  }

  if (bestDistance > snapDistance) {
    iface.snap.attachedToPartEdge = null
    return
  }

  iface.snap.attachedToPartEdge = bestSide

  if (bestSide === "top") iface.y = parentPart.y
  if (bestSide === "right") iface.x = parentPart.x + parentPart.width - iface.width
  if (bestSide === "bottom") iface.y = parentPart.y + parentPart.height - iface.height
  if (bestSide === "left") iface.x = parentPart.x
}
```

---

## 7) Connector function prototypes

### 7.1 Endpoint resolution

```js
function resolveConnectorEndpointSide(iface, requestedSide, connectorKind) {
  if (connectorKind === "external" && iface.snap?.attachedToPartEdge) {
    return iface.snap.attachedToPartEdge
  }
  return requestedSide
}

function getConnectorEndpoints(doc, connector) {
  const source = doc.entities[connector.source.interfaceId]
  const target = doc.entities[connector.target.interfaceId]

  const sourceSide = resolveConnectorEndpointSide(
    source,
    connector.source.side,
    connector.connectorKind
  )

  const targetSide = resolveConnectorEndpointSide(
    target,
    connector.target.side,
    connector.connectorKind
  )

  return {
    start: getEdgeMidpoint(source, sourceSide),
    end: getEdgeMidpoint(target, targetSide)
  }
}
```

### 7.2 Direction reversal

```js
function reverseConnector(connector) {
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

### 7.3 Routing contract

```js
function chooseBestConnectorRoute(doc, connector) {
  // 1. collect candidate source sides
  // 2. collect candidate target sides
  // 3. generate route candidate for each pair
  // 4. reject invalid routes
  // 5. score remaining routes
  // 6. choose lowest-score valid route
}
```

---

## 8) Note function prototypes

```js
function moveNote(note, dx, dy) {
  note.x += dx
  note.y += dy
}

function resizeNoteFromEdge(note, edge, dx, dy, minWidth = 80, minHeight = 40) {
  resizePartFromEdge(note, edge, dx, dy, minWidth, minHeight)
}
```

---

## 9) Naming function prototypes

```js
function makeInterfaceId(partId, index) {
  return `${partId}_inf${index}`
}

function makePartPairRelationshipName(sourcePartId, targetPartId) {
  return `${sourcePartId}_${targetPartId}`
}
```

---

## 10) Entity handler registry prototype

```js
const handlers = {
  part: {
    getBounds,
    getEdgeMidpoint,
    move: movePart,
    resizeFromEdge: resizePartFromEdge
  },

  interface: {
    getBounds,
    getEdgeMidpoint,
    layout: layoutInterfaceSize,
    moveWithinParent: moveInterfaceWithinPart,
    maybeSnapToParentEdge: maybeSnapInterfaceToPartEdge
  },

  note: {
    getBounds,
    getEdgeMidpoint,
    move: moveNote,
    resizeFromEdge: resizeNoteFromEdge
  },

  connector: {
    getEndpoints: getConnectorEndpoints,
    reverse: reverseConnector,
    chooseRoute: chooseBestConnectorRoute
  }
}
```

---

## 11) Main design rule

Store source geometry and relationships in the document model.
Derive midpoint candidates, connector endpoints, and routes from that model.
Render SVG from the derived result.
