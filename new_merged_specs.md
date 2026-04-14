# Canvas App Merged Specification

This document merges `requirements.md`, `UI.md`, `new_prototype.md`, and `additional_reqs.md` into one canonical implementation spec, and it also incorporates follow-up clarifications provided during merge review.

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
- For multi-segment connectors, every adjacent pair of segments must meet at 90 degrees; diagonal connector segments are not allowed.
- The canvas background color is fixed to white in the MVP.
- The application chrome uses a modern, restrained color palette that keeps focus on the canvas.
- UI controls use simple visual elements, compact sizing, and a maximum UI corner radius of 3px so they do not dominate the workspace.
- The default application-UI font size is 12px.
- Edge resize is required for parts and notes. Corner resize handles are optional convenience controls and must obey the same min-size rules.

## 3. Application shell

The UI shall contain:

- A top bar exposing the primary command set defined in this spec.
- A left-side area with creation actions and the tree view.
- A center SVG canvas with grid or guides.
- A right context pane that shows exactly one mode at a time: `edit` or `review`; it no longer hosts the tree view.
- A bottom bar showing status and view information such as cursor position, zoom controls, zoom percentage, snap state, hovered entity, selection count, and current mode.

Responsive behavior:

- The top bar and bottom bar remain fixed-height.
- The center canvas expands fluidly between them.
- The top bar is a single compact horizontal row for primary UI commands.
- The bottom bar is a compact horizontal information bar for status and view controls.
- On smaller screens, the left pane may collapse and the right pane may become a drawer.

Pane scrolling behavior:

- The application shell should avoid whole-page scrolling during normal editing.
- If the content of the left pane, right pane, or another shell pane exceeds the available vertical space, that pane shall scroll internally.
- The page itself should remain fixed while pane-local scrolling is used for overflow content.
- The canvas viewport shall remain independently pannable and zoomable without causing whole-page scrolling.

Mode-toggle clarification:

- The top-bar toggle reflects the selection-driven mode rules defined later in this spec.
- Review mode may always be entered explicitly.
- Edit mode is only meaningful when at least one entity is selected.

### 3.0 Visual design and UI density

Application-shell styling rules:

- The center canvas background shall be white.
- The surrounding application chrome, including the top bar, bottom bar, left pane, right pane, menus, buttons, inputs, toggles, and dialogs, shall use a modern, restrained color palette.
- The UI shall prefer simple rectangular elements over decorative treatments.
- UI controls, rows, panels, and affordances shall be compact rather than oversized so the canvas remains the visual focus, and application-UI corner radius shall not exceed 3px.
- The default font size for application UI chrome is 12px.
- The top bar shall be laid out as a single compact row.
- The bottom bar shall be laid out as a compact row for status and view controls.
- "Application UI chrome" means the non-diagram interface elements of the app, including toolbars, the top bar, bottom bar, panes, tree view, context-pane form controls, menus, dialogs, and related shell controls.
- The 12px application-UI font size does not redefine diagram text sizes, which continue to follow the document and entity typography rules elsewhere in this spec.

### 3.1 Top bar command set

The top bar shall expose explicit commands for:

- `New`
- `Save`
- `Load`
- `Export SVG`
- `Export Canvas`
- `Export View`
- `Undo`
- `Redo`
- `Fit`
- `Grid`
- `Snap`
- `Validate`
- `Edit/Review` mode toggle

Additional command rules:

- The UI may render these as grouped menus, grouped buttons, or a hybrid arrangement, but the command set above is normative.
- `New` resets the working document to a blank valid document and requires confirmation when unsaved changes would be discarded.
- `Save` serializes the current committed model.
- `Load` deserializes a saved model, validates it, and rejects malformed content.
- `Fit` reframes the diagram or current selection within the visible viewport without mutating document geometry.
- `Grid` toggles the visible canvas grid independently from snapping.
- Top-bar controls should remain visually compact, fit within a single horizontal row in normal desktop layouts, and use the application-UI font sizing, restrained palette, and 3px maximum corner radius defined above.

Bottom bar rules:

- The bottom bar is intended for status and view information rather than primary creation or file commands.
- The bottom bar may contain zoom in, zoom out, zoom percentage, current mode, snap state, hovered entity, cursor position, and selection count.
- Commands or indicators placed in the bottom bar shall remain compact and secondary to the primary command set in the top bar.

### 3.2 Tree view contract

The app shall provide a tree view in the left pane, and that tree view is synchronized with the document model.

Tree view rules:

- The tree view is rendered in the left pane and remains available independently of whether the right context pane is in Edit mode or Review mode.
- The tree root represents the current document.
- Parts are parent nodes.
- Interfaces appear as children of their parent part.
- Connectors and notes appear as top-level entity nodes unless a later spec explicitly defines a different grouping.
- Selecting a tree node selects the same entity on the canvas and updates `ui.selection` and `ui.primarySelectionId`.
- Selecting an entity on the canvas updates the tree view selection.
- Tree ordering must remain consistent with model ownership and draw order where applicable.

Example tree structure as ASCII text for easy copy/paste:

```text
Document
+-- Part: partA
|   +-- Interface: partA_inf1
|   `-- Interface: partA_inf2
+-- Part: partB
|   `-- Interface: partB_inf1
+-- Connector: connector:1
`-- Note: note:1
```

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
    minInterfaceHeight: 24,
  },

  entities: {
    // [entityId]: PartEntity | InterfaceEntity | ConnectorEntity | NoteEntity
  },

  order: [],

  ui: {
    mode: "review", // "edit" | "review"
    selection: [], // string[]
    primarySelectionId: null, // string | null
    hoveredId: null, // string | null
    cursorCanvasPosition: null, // { x: number, y: number } | null
    zoom: 1,
    currentModeLabel: null, // string | null, optional derived UI label for display in the bottom bar
    gridEnabled: true,
    snapEnabled: true,
    activeTool: null, // string | null
  },
};
```

Rules:

- `ui.mode` is mutually exclusive: `edit` XOR `review`.
- `Esc` clears active tools, clears selection, and sets `ui.mode = "review"`.
- `ui.selection` supports multi-select.
- `ui.primarySelectionId` tracks the last focused entity and must be a member of `ui.selection` when not null.
- `ui.gridEnabled` controls grid visibility only and does not change geometry or snapping rules.
- The bottom bar reads from `ui`, including `cursorCanvasPosition`, `zoom`, current mode state, and selection telemetry.

## 5. Canonical entity models

### 5.1 Base entity

```js
const BaseEntity = {
  id: "entity:1",
  type: "part", // "part" | "interface" | "connector" | "note"
  visible: true,
  locked: false,
};
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
    y: 24,
  },

  style: {
    fill: "#ffffff",
    stroke: "#222222",
    strokeWidth: 2,
    cornerRadius: 0,
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
```

Part rules:

- Parts are movable.
- Parts support edge-based resize with min-size enforcement.
- Parts are rendered as four-edged rectangles on the canvas.
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
    maxWidth: 220,
  },

  textStyle: {
    fontFamily: "Inter, sans-serif",
    fontSize: null,
    fontWeight: 400,
    fill: "#111111",
  },

  style: {
    fill: null,
    stroke: "#222222",
    strokeWidth: 1,
    cornerRadius: 0,
  },

  snap: {
    attachedToPartEdge: null, // null | "top" | "right" | "bottom" | "left"
  },

  visible: true,
  locked: false,
};
```

Interface rules:

- Each interface belongs to exactly one part.
- Interfaces are rendered as four-edged rectangles on the canvas.
- The editable interface name is `localName`.
- The rendered interface label is derived as `${parentPart.partId}_${localName}`.
- Changing a part's `partId` must immediately update all rendered child interface labels that depend on it.
- When a new external connection is created between `PartA` and `PartB`, the participating interface on `PartA` shall have `localName = "PartB"` and therefore render as `PartA_PartB`; the participating interface on `PartB` shall have `localName = "PartA"` and therefore render as `PartB_PartA`.
- The external interface naming rule is applied at external-connection creation time and is consistent with the general rendered-label derivation rule above.
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
    preferredSide: "auto", // "auto" | "top" | "right" | "bottom" | "left"
    resolvedSide: "right",
  },

  target: {
    interfaceId: "interface:2",
    preferredSide: "auto",
    resolvedSide: "left",
  },

  direction: {
    arrowHeadSide: "target", // "none" | "source" | "target" | "both"
  },

  arrowSizeOverride: null,
  content: "",

  style: {
    stroke: "#222222",
    strokeWidth: 2,
  },

  textStyle: {
    fontFamily: "Inter, sans-serif",
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
```

Connector rules:

- Connector kind is derived from endpoints.
- `internal` if both endpoint interfaces belong to the same part.
- `external` otherwise.
- Connector kind is not user-editable.
- `preferredSide` stores user intent.
- `resolvedSide` stores the side actually used after routing and geometric evaluation.
- `arrowSizeOverride` is an optional per-connector instance override.
- Effective arrow size is `arrowSizeOverride ?? settings.arrowSize`.
- Connector content may render with the stored `textStyle`, but connector text styling is not user-editable in the MVP.
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
    lineHeight: 1.3,
  },

  style: {
    fill: "#fff7cc",
    stroke: "#222222",
    strokeWidth: 1,
    cornerRadius: 3,
  },

  visible: true,
  locked: false,
};
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

Exactly one pane mode is rendered in the right context pane at a time.

### 7.1 Review mode

Review mode contains:

- Document settings
- Document summary information for review
- Validation status

Review mode fields:

- `arrowSize`
- `interfaceFillColor`
- `partIdFontSize`
- `interfaceFontSize`

The Review pane must show document settings above the review summary.

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
- Fields not listed above, including connector `textStyle`, are not user-editable in the MVP.
- Invalid values are blocked or constrained inline.
- Field edits commit on `blur`, `Enter`, picker close, or drag-end.

## 8. Selection, mode, and interaction rules

Selection rules:

- The app supports single-select and multi-select.
- Selecting at least one entity sets `ui.mode = "edit"`.
- Clearing selection sets `ui.mode = "review"`.
- Clicking an empty canvas area while no placement flow is in progress shall behave like `Esc`: it clears selection, clears `activeTool`, and sets `ui.mode = "review"`.
- `primarySelectionId` updates to the most recently focused selected entity.

Empty-canvas click clarification:

- If the user is not in the middle of intentionally placing a part, interface, connector, or note, clicking an empty area of the canvas shall be treated as a dismiss action.
- That dismiss action shall have the same effect as pressing `Esc` for selection and mode purposes.
- If a creation flow is actively awaiting canvas placement or target picking, the click shall continue to serve that active tool flow instead of dismissing it.

Tool rules:

- `Esc` cancels in-progress tool flows, clears selection, clears `activeTool`, and switches to Review mode.
- `Add Interface` is a guided flow:
  - If exactly one part is already selected, that part is used as the parent immediately.
  - Otherwise, the user must click a target part on the canvas to select the parent.
  - Once the parent part is known, a new interface entity is created immediately.
  - The new interface is inserted into `entities` and its id is appended to the parent part `interfaceIds[]`.
  - The interface is positioned inside the parent part using a default placement strategy and must be clamped to remain fully within the parent bounds.
  - The interface is auto-sized from its rendered label text and padding.
  - The initial `localName` shall be generated (for example `inf1`, `inf2`, ...) and must be unique within the parent part.
  - After creation, the new interface becomes the sole selection, `ui.primarySelectionId` is set to it, and `ui.mode` switches to `"edit"`.
- `Add Connector` is a guided flow: pick source interface or source part, pick target interface or target part, apply external interface naming when a new external interface pair is created, compute route, and persist connector.
- `Delete Entity` acts on the current selection.
- `Reset Canvas` is destructive and requires confirmation.

Viewport rules:

- Mouse wheel or middle-mouse scrolling zooms and adjusts `ui.zoom`.
- Zoom should focus on the cursor location.
- Middle mouse drag pans the canvas.
- Pressing `Space` with a non-empty selection centers the selection envelope in the viewport without mutating document geometry or changing zoom.
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
- Route selection shall minimize bend count before minimizing total path length.
- Connectors shall avoid introducing unnecessary micro-segments or short orthogonal jogs near endpoints when a simpler valid orthogonal route exists.
- Connectors shall prefer visually clean routes with the fewest segments necessary to satisfy orthogonality, endpoint constraints, and obstacle avoidance.
- Connectors reroute after dependent movement, resize, text change, snap change, or reversal.

## 11. Commit pipeline

Every mutating action follows this order:

1. Validate the attempted action against lock state, mode, containment, and enum constraints.
2. Apply the scoped state mutation to the document model.
3. Recompute derived geometry, auto-sizing, snapping, connector kind, resolved sides, and routes as needed.
4. Refresh tree view and validation status.
5. Re-render the SVG from the updated model.

Edit commit rules:

- No Apply button is used for right-pane edits.
- Pane edits commit on edit-finish boundaries only.
- Canvas drags and resizes commit on drag-end.
- Left-pane tree view, right pane, review summary, bottom bar, and canvas visuals must remain synchronized after each commit.

### 11.1 Undo and redo

Undo and redo operate on committed document states.

History rules:

- Each committed pane edit produces one undoable history entry.
- Each completed canvas drag or resize produces one undoable history entry at drag-end, not on every transient pointer move.
- `Undo` restores the last committed document state and any mode or selection state that is required for consistency.
- `Redo` reapplies the next committed document state when available.
- Transient hover and cursor-position telemetry need not participate in undo/redo history.

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

### 13.1 Export requirements

The app shall support the following exports:

- `Export SVG`: exports a vector representation of the current diagram state.
- `Export Canvas`: exports the whole diagram as a high-resolution PNG.
- `Export View`: exports the currently visible viewport as a high-resolution PNG.

PNG export rules:

- `Export Canvas` and `Export View` shall render at 600 dpi.
- For browser implementations, 600 dpi shall be treated as a rasterization scale factor of `600 / 96 = 6.25` relative to CSS-pixel layout unless a stricter implementation detail is defined elsewhere.
- PNG exports shall exclude surrounding application chrome such as panes, toolbars, top bars, bottom bars, and tree-view shells.
- The white canvas background is part of the exported diagram surface unless transparency is explicitly defined by a later spec.

`Export Canvas` rules:

- The exported area shall be based on an invisible envelope boundary covering all rendered diagram elements.
- The invisible envelope boundary is the axis-aligned bounding box of all rendered elements in diagram space, including parts, interfaces, notes, connector paths, labels, arrowheads, and other non-transient rendered marks.
- The invisible envelope boundary excludes non-diagram UI overlays such as selection handles, hover affordances, context panes, and status-bar telemetry unless a later spec explicitly defines them as part of the export.

`Export View` rules:

- The exported area is the current visible canvas viewport exactly as framed on screen at export time.
- If the grid is currently visible, the viewport export includes the grid.
- If the grid is not visible, the viewport export omits it.

## 14. Acceptance checklist

The app is implementation-complete against this spec when:

- `edit` and `review` are mutually exclusive.
- `Esc` cancels active flows, clears selection, and switches to Review mode.
- Mouse wheel zoom and middle-mouse pan work.
- Pressing `Space` centers the current selection.
- Review mode shows document settings above the review summary.
- Right-pane edits do not use an Apply button.
- Multi-selection works, and entity field editing is only enabled for a single selection.
- Part labels are movable and remain within the part.
- Interface labels update immediately after part ID changes.
- External connection creation applies the `PartA_PartB` and `PartB_PartA` naming rule to the participating endpoint interfaces.
- Interface auto-size, containment, and snapping work reliably.
- External connectors avoid obstacles.
- Internal connectors may cross obstacles.
- Connector kind is derived correctly from topology.
- Connector reversal changes direction only.
- Connector routes and resolved sides update after dependent changes.
- `Export SVG` outputs the current diagram as vector content.
- `Export Canvas` outputs the whole diagram as a 600 dpi PNG using the invisible envelope boundary.
- `Export View` outputs the current viewport as a 600 dpi PNG.
- Undo and redo restore committed states correctly.
- The top bar exposes `New`, `Save`, `Load`, `Export SVG`, `Export Canvas`, `Export View`, `Undo`, `Redo`, `Fit`, and `Grid`.
- The bottom bar presents status and view controls such as `Zoom Out`, `Zoom In`, zoom percentage, current mode, snap state, cursor position, hovered entity, and selection count.
- The left-pane tree view and bottom bar remain synchronized with current model state.
- The canvas background is white.
- Multi-segment connector routes use only orthogonal segments with 90-degree bends.
- The application chrome uses a modern restrained palette with simple, compact UI elements.
- The top bar is rendered as a compact single-row layout.
- Application-UI corner radius does not exceed 3px.
- The tree view is shown in the left pane and remains available independently of right-pane Edit or Review mode.
- The review-pane tree structure is presented as copyable ASCII text.
- Parts and interfaces are rendered as four-edged rectangles on the canvas.
- Application-UI font sizing defaults to 12px without changing diagram text sizing rules.
- The left-pane tree view stays synchronized with canvas selection and model structure.
- Clicking an empty canvas area outside an active placement flow behaves like `Esc` and switches the app to Review mode.
