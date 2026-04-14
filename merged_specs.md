# Canvas App Merged Specification

This document merges `requirements.md`, `UI.md`, and `new_prototype.md` into one canonical implementation spec.

If this document conflicts with any earlier spec, this document wins.

## 1. Scope and intent

The app is a structured SVG diagram editor for:

- Parts
- Interfaces
- Connectors
- Notes

The implementation is model-first:

- The document model is the single source of truth.
- SVG is a deterministic render target.
- Geometry, containment, snapping, routing, selection, and mode state live in the model.
- Pane edits commit on edit-finish and rerender immediately.

## 2. Resolved decisions from the earlier specs

The previous docs were broadly aligned, but they left several implementation-critical points ambiguous. This merged spec resolves them as follows:

- `interfaceArrowSize` is removed from the MVP because its purpose was not defined consistently. The canonical document settings are `arrowSize`, `interfaceFillColor`, `partIdFontSize`, and `interfaceFontSize`.
- Multi-selection is supported for canvas operations and telemetry, but entity field editing requires exactly one selected entity.
- Connector kind is derived from topology, not user-edited. A connector is `internal` when both endpoints belong to interfaces in the same part; otherwise it is `external`.
- Connectors store user preference for endpoint sides separately from resolved sides used for rendering and routing.
- Part labels have their own stored position inside the part and are directly manipulable.
- Interface display labels are derived from the parent part ID and the interface local name so part ID changes propagate automatically.
- Edge resize is required for parts and notes. Corner resize handles are optional convenience controls and must obey the same min-size rules.

## 3. Application shell

The UI shall contain:

- A top bar with `File`, `Edit`, `View`, `Zoom`, `Snap`, `Validate`, `Export`, and an `Edit/Review` mode toggle.
- A left action pane with `Add Part`, `Add Interface`, `Add Connector`, `Add Note`, `Delete Entity`, and `Reset Canvas`.
- A center SVG canvas with grid or guides.
- A right context pane that shows exactly one mode at a time: `edit` or `review`.
- A status bar showing cursor position, zoom, snap state, hovered entity, and selection count.

Responsive behavior:

- Top bar and status bar remain fixed-height.
- The center canvas expands fluidly.
- On smaller screens, the left pane may collapse and the right pane may become a drawer.

## 4. Canonical document model

```js
const DocumentModel = {
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
    minInterfaceHeight: 24
  },

  entities: {
    // [entityId]: PartEntity | InterfaceEntity | ConnectorEntity | NoteEntity
  },

  order: [],

  ui: {
    mode: "review",                 // "edit" | "review"
    selection: [],                  // string[]
    primarySelectionId: null,       // string | null
    hoveredId: null,                // string | null
    cursorCanvasPosition: null,     // { x: number, y: number } | null
    zoom: 1,
    snapEnabled: true,
    activeTool: null                // string | null
  }
}
```

Rules:

- `ui.mode` is mutually exclusive: `edit` XOR `review`.
- `Esc` clears active tools, clears selection, and sets `ui.mode = "review"`.
- `ui.selection` supports multi-select.
- `ui.primarySelectionId` tracks the last focused entity and must be a member of `ui.selection` when not null.
- The status bar reads from `ui`, including `cursorCanvasPosition`.

## 5. Canonical entity models

### 5.1 Base entity

```js
const BaseEntity = {
  id: "entity:1",
  type: "part",                     // "part" | "interface" | "connector" | "note"
  visible: true,
  locked: false
}
```

### 5.2 Part

```js
const PartEntity = {
  id: "part:1",
  type: "part",
  x: 100,
  y: 80,
  width: 280,
  height: 180,

  partId: "partA",
  interfaceIds: ["interface:1"],

  labelPosition: {
    x: 16,
    y: 24
  },

  style: {
    fill: "#ffffff",
    stroke: "#222222",
    strokeWidth: 2,
    cornerRadius: 8
  },

  textStyle: {
    partIdFontSize: null
  },

  childDefaults: {
    interfaceFontSize: null,
    interfaceFillColor: null
  },

  visible: true,
  locked: false
}
```

Part rules:

- Parts are movable.
- Parts support edge-based resize with min-size enforcement.
- Corner resize handles may be added, but they are optional.
- `labelPosition` is stored relative to the part origin and must remain within the part's inner bounds.
- When a part moves, its label and child interfaces move with it.
- When a part resizes, the label position and child interfaces must be clamped as needed to preserve containment.

### 5.3 Interface

```js
const InterfaceEntity = {
  id: "interface:1",
  type: "interface",

  parentPartId: "part:1",
  localName: "inf1",

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
    fontSize: null,
    fontWeight: 400,
    fill: "#111111"
  },

  style: {
    fill: null,
    stroke: "#222222",
    strokeWidth: 1,
    cornerRadius: 6
  },

  snap: {
    attachedToPartEdge: null       // null | "top" | "right" | "bottom" | "left"
  },

  visible: true,
  locked: false
}
```

Interface rules:

- Each interface belongs to exactly one part.
- The editable interface name is `localName`.
- The rendered interface label is derived as `${parentPart.partId}_${localName}`.
- Changing a part's `partId` must immediately update all rendered child interface labels that depend on it.
- Interface width and height are auto-sized from the rendered label text plus padding.
- Manual interface resize is not supported.
- Interface movement is constrained to parent bounds.
- Interfaces may snap to part edges when within `settings.snapThreshold`.
- If no edge is within threshold, snapped-edge state clears.
- Interface label text is normalized by trimming leading and trailing whitespace before persistence.

### 5.4 Connector

```js
const ConnectorEntity = {
  id: "connector:1",
  type: "connector",

  source: {
    interfaceId: "interface:1",
    preferredSide: "auto",         // "auto" | "top" | "right" | "bottom" | "left"
    resolvedSide: "right"
  },

  target: {
    interfaceId: "interface:2",
    preferredSide: "auto",
    resolvedSide: "left"
  },

  direction: {
    arrowHeadSide: "target"        // "none" | "source" | "target" | "both"
  },

  arrowSizeOverride: null,
  content: "",

  style: {
    stroke: "#222222",
    strokeWidth: 2
  },

  textStyle: {
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    fill: "#111111"
  },

  routing: {
    kind: "orthogonal",
    segments: []
  },

  visible: true,
  locked: false
}
```

Connector rules:

- Connector kind is derived from endpoints:
- `internal` if both endpoint interfaces belong to the same part.
- `external` otherwise.
- Connector kind is not user-editable.
- `preferredSide` stores user intent.
- `resolvedSide` stores the side actually used after routing and geometric evaluation.
- `arrowSizeOverride` is an optional per-connector instance override.
- Effective arrow size is `arrowSizeOverride ?? settings.arrowSize`.
- Connector direction reversal swaps source and target endpoints and remaps arrowhead semantics only.
- Reversal does not mutate content, style, arrow size, or routing mode.

### 5.5 Note

```js
const NoteEntity = {
  id: "note:1",
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

Note rules:

- Notes are movable.
- Notes support edge-based resize with min-size enforcement.
- Corner resize handles may be added, but they are optional.

## 6. Inheritance and precedence rules

Document defaults, part-level overrides, and instance-level overrides coexist. The precedence order is:

- Part label font size: `part.textStyle.partIdFontSize ?? settings.partIdFontSize`
- Interface font size: `interface.textStyle.fontSize ?? part.childDefaults.interfaceFontSize ?? settings.interfaceFontSize`
- Interface fill color: `interface.style.fill ?? part.childDefaults.interfaceFillColor ?? settings.interfaceFillColor`
- Connector arrow size: `connector.arrowSizeOverride ?? settings.arrowSize`

Additional rules:

- Null means "inherit", not "unset to blank".
- Rendered values are resolved at render time or in a derived view model, not duplicated into persistent state.
- Only supported inherited fields participate in this chain. All other style values are instance-level unless explicitly defined otherwise.

## 7. Right pane behavior

Exactly one pane mode is rendered at a time.

### 7.1 Review mode

Review mode contains:

- Document settings
- Canvas summary
- Validation status

Review mode fields:

- `arrowSize`
- `interfaceFillColor`
- `partIdFontSize`
- `interfaceFontSize`

The Review pane must show document settings above the canvas summary.

### 7.2 Edit mode

Edit mode behavior:

- If `selection.length === 1`, the right pane shows editable fields for that entity only.
- If `selection.length > 1`, the right pane shows a multi-selection summary and no entity-specific field editors.
- Raw `x`, `y`, `width`, and `height` fields are hidden in normal Edit Mode because geometry is edited by direct manipulation.

Editable fields by entity type:

- Part: `partId`, `style.fill`, `textStyle.partIdFontSize`, `childDefaults.interfaceFontSize`, `childDefaults.interfaceFillColor`
- Interface: `localName`, `textStyle.fontSize`, `style.fill`
- Connector: `source.preferredSide`, `target.preferredSide`, `direction.arrowHeadSide`, `arrowSizeOverride`, `content`, `style.stroke`, `style.strokeWidth`
- Note: `text`, `textStyle.fontSize`, `style.fill`, `style.stroke`, `style.strokeWidth`

Edit pane rules:

- Only editable fields are shown.
- Internal fields and derived fields are hidden.
- Invalid values are blocked or constrained inline.
- Field edits commit on `blur`, `Enter`, picker close, or drag-end.

## 8. Selection, mode, and interaction rules

Selection rules:

- The app supports single-select and multi-select.
- Selecting at least one entity sets `ui.mode = "edit"`.
- Clearing selection sets `ui.mode = "review"`.
- `primarySelectionId` updates to the most recently focused selected entity.

Tool rules:

- `Esc` cancels in-progress tool flows, clears selection, clears `activeTool`, and switches to Review mode.
- `Add Interface` requires a selected parent part or an explicit parent-pick step.
- `Add Connector` is a guided flow: pick source interface, pick target interface, compute route, persist connector.
- `Delete Entity` acts on the current selection.
- `Reset Canvas` is destructive and requires confirmation.

Viewport rules:

- Mouse wheel zoom adjusts `ui.zoom`.
- Zoom should focus on the cursor location.
- Middle mouse drag pans the canvas.
- Canvas zoom is independent from browser zoom.

## 9. Geometry, containment, and snapping

Geometry rules:

- Parts, interfaces, and notes persist `x`, `y`, `width`, and `height`.
- Parts and notes must remain valid rectangles after every resize.
- Interfaces auto-size from text and padding and remain valid rectangles after every text or font change.

Containment rules:

- Interfaces must remain fully contained within their parent part after any part move, part resize, interface move, or interface text resize.
- Out-of-bounds interface movement is clamped or rejected.
- Part labels must remain within part bounds after direct manipulation and after part resize.

Snapping rules:

- Global snapping is controlled by `ui.snapEnabled`.
- If snapping is on, interfaces may snap to `top`, `right`, `bottom`, or `left` part edges when within threshold.
- If snapping is off, interfaces move freely within the allowed parent bounds and `snap.attachedToPartEdge` is cleared.
- Snapped state must be represented consistently in model and visuals.

## 10. Connector resolution and routing

Endpoint rules:

- Connectors attach only to interface edge midpoints.
- Routing evaluates from `preferredSide` to `resolvedSide`.
- For external connectors, a snapped interface edge overrides a manual preferred side.
- If `preferredSide === "auto"`, the system chooses the best side dynamically.

Resolved-side algorithm:

- Start from the user's `preferredSide`.
- If the connector is external and the endpoint interface is snapped to a part edge, use the snapped edge.
- Otherwise evaluate candidate interface edge midpoints.
- Choose the side that produces the best valid orthogonal route under the current geometry.

Routing rules:

- Routing is orthogonal and may contain multiple segments.
- External connectors must avoid crossing parts, interfaces, notes, and their rendered labels.
- Internal connectors may cross entities.
- Route selection prefers the shortest valid route with reasonable bend count and clearance.
- Connectors reroute after dependent movement, resize, text change, snap change, or reversal.

## 11. Commit pipeline

Every mutating action follows this order:

1. Validate the attempted action against lock state, mode, containment, and enum constraints.
2. Apply the scoped state mutation to the document model.
3. Recompute derived geometry, auto-sizing, snapping, connector kind, resolved sides, and routes as needed.
4. Refresh review summary and validation status.
5. Re-render the SVG from the updated model.

Edit commit rules:

- No Apply button is used for right-pane edits.
- Pane edits commit on edit-finish boundaries only.
- Canvas drags and resizes commit on drag-end.
- Right pane, review summary, status bar, and canvas visuals must remain synchronized after each commit.

## 12. Validation requirements

At minimum, validation must enforce:

- Every `interface.parentPartId` points to an existing part.
- Every part `interfaceIds[]` entry points to an existing interface owned by that part.
- Interface bounds remain within parent bounds.
- Part label position remains within part bounds.
- Every connector source and target interface exists.
- Every connector side enum is valid.
- Rectangular entities meet minimum thresholds.
- `ui.mode` is either `edit` or `review`.
- `primarySelectionId` is null or a member of `ui.selection`.
- Derived connector kind matches endpoint topology.

Validation is callable from the top bar and surfaces results in the active context pane.

## 13. Persistence and identity rules

- Entity IDs are stable identifiers and are not derived from visible labels.
- Interface entity IDs remain stable even if a part ID or interface local name changes.
- The displayed interface label is derived and may change; the entity ID must not.
- Save and reload must preserve all committed model values exactly.
- Deserialization must validate the document and reject malformed IDs or broken references.

## 14. Acceptance checklist

The app is implementation-complete against this spec when:

- `edit` and `review` are mutually exclusive.
- `Esc` cancels active flows, clears selection, and switches to Review mode.
- Mouse wheel zoom and middle-mouse pan work.
- Review mode shows document settings above summary.
- Right-pane edits do not use an Apply button.
- Multi-selection works, and entity field editing is only enabled for a single selection.
- Part labels are movable and remain within the part.
- Interface labels update immediately after part ID changes.
- Interface auto-size, containment, and snapping work reliably.
- External connectors avoid obstacles.
- Internal connectors may cross obstacles.
- Connector kind is derived correctly from topology.
- Connector reversal changes direction only.
- Connector routes and resolved sides update after dependent changes.
- Status bar and review summary remain synchronized with current model state.
