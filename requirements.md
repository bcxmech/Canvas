# Canvas App Requirements Specification

## 1. Purpose and Scope

This document defines product requirements for the Canvas web app described in `canvasbp.md`, aligned with `prototype.md` and `diagram-model-prototypes.ts`.

The app is a **structured, SVG-rendered diagram editor** where:
- The **document model is the source of truth**.
- **Geometry and relationships are stored in model state**.
- **SVG is a deterministic render target**, not the primary state container.

The app supports four entity types:
- Parts
- Interfaces
- Connectors
- Notes

---

## 2. Product Vision and Non-Goals

### 2.1 Vision
Build a technical, geometry-aware editor for structured diagrams with predictable behavior, strict containment, and rule-driven routing.

### 2.2 Non-Goals
- Freeform whiteboarding behavior as the default experience.
- DOM-only geometry calculations without backing model state.
- Multiple conflicting interaction modes active at the same time.

---

## 3. Information Architecture and UI Layout

### 3.1 Global Layout
The UI SHALL include:
1. **Top Bar** with: File, Edit, View, Zoom, Snap, Validate, Export, and Review/Edit Toggle.
2. **Left Pane** actions: Add Part, Add Interface, Add Connector, Add Note, Delete Entity, Reset Canvas.
3. **Center Canvas** as SVG render area with grid/guides and connector display.
4. **Right Pane** that displays exactly one mode at a time: Review mode or Edit mode.
5. **Status Bar** showing cursor x/y, zoom, selection count, snap state, and hovered element.

### 3.2 Mode Exclusivity
- UI SHALL enforce mutual exclusivity of modes: `edit` XOR `review`.
- Any mode switch SHALL update `ui.mode` in the document model before re-render.
- Pressing `Esc` SHALL interrupt active tools/operations, clear selection, and switch mode to `review`.

---

## 4. Core Design Principles (Normative)

1. **Model First**: All user actions update document state first.
2. **Derived Rendering**: SVG output is fully derived from state.
3. **Deterministic Geometry**: Midpoints, bounds, snapping, and routing derive from shared geometric rules.
4. **Single Source of Truth**: No conflicting state copies between model and SVG/DOM.
5. **Structured UX**: Interaction fidelity prioritizes technical precision over sketch-like looseness.

---

## 5. Data Model Requirements

### 5.1 Document Root
The system SHALL persist a `DocumentModel` with:
- `settings`
- `entities` keyed by entity id
- `order` for draw/layer order
- `ui` for mode and interaction state

Required `ui` fields:
- `mode: "edit" | "review"`
- `selection: string[]`
- `hoveredId: string | null`
- `zoom: number`
- `snapEnabled: boolean`
- `activeTool: string | null`

### 5.2 Entity Taxonomy
All entities SHALL satisfy `BaseEntity` fields:
- `id`, `type`, `visible`, `locked`

Rectangular entities (Part, Interface, Note) SHALL also store:
- `x`, `y`, `width`, `height`

Supported entity types:
- `part`
- `interface`
- `connector`
- `note`

---

## 6. Entity Requirements

## 6.1 Part Requirements
- A Part SHALL be movable on the canvas.
- A Part SHALL be resizable from top/right/bottom/left edges.
- Resizing SHALL enforce minimum dimensions.
- A Part SHALL maintain child interfaces (`interfaceIds`).
- Interfaces SHALL remain fully contained within their parent Part after drag/resize.
- A Part ID label SHALL be movable within the Part geometry while remaining inside Part bounds.
- Updating a Part ID label SHALL immediately propagate to dependent child interface displays that reference that Part ID.

## 6.2 Interface Requirements
- An Interface SHALL belong to exactly one Part (`parentPartId`).
- Interface size SHALL be derived from label text and padding.
- Manual resize of interfaces SHALL NOT be supported.
- Interface movement SHALL be constrained to parent bounds.
- Edge snapping to parent edges SHALL be supported (`top|right|bottom|left`).
- If no edge is within snap threshold, snapped-edge state SHALL clear.
- Interfaces SHALL expose edge midpoint candidates for connectors.

## 6.3 Connector Requirements

### Topology and kind
- Connector SHALL reference source and target interfaces with preferred endpoint sides.
- Connector kind SHALL support `internal` and `external`.

### Direction and reversal
- Connector SHALL support arrow direction modes: `none|source|target|both`.
- **Only connector direction SHALL be reversible**.
- Reversal SHALL swap source/target and remap arrow-head semantics only; kind/content/style remain unchanged.
- If arrow direction is reversed from Edit Mode controls, the rendered connector SHALL immediately reflect the new direction.

### Endpoint and routing behavior
- Routing model SHALL support orthogonal segments.
- Connectors SHALL re-evaluate endpoint side choices after part/interface movement.
- Endpoint resolution SHALL prefer the side that best fits current geometry and route score.
- For `external` connectors, if an interface is snapped to a part edge, that edge SHALL override requested side.
- `external` connector routing SHALL avoid crossing other entities (parts, interfaces, notes).
- `internal` connector routing MAY cross entities.

## 6.4 Note Requirements
- Notes SHALL be movable rectangular entities with text and style settings.
- Notes SHALL support edge-based resize with minimum dimensions.

---

## 7. Interaction and Input Requirements

### 7.1 Pointer-driven viewport control
- Canvas SHALL zoom in/out via mouse wheel scrolling.
- Zoom focal point SHOULD be the current cursor location.
- Canvas SHALL pan while middle mouse button is held and dragged.

### 7.2 Interaction loop
For every user action:
1. Validate action against rules (lock state, containment, mode).
2. Update model state.
3. Recompute derived geometry/routing as needed.
4. Re-render SVG from updated model.

### 7.3 Selection and hover
- System SHALL support multi-selection in `ui.selection`.
- Hovered entity SHALL be represented by `ui.hoveredId`.

### 7.4 Snap, lock, visibility
- Global snapping SHALL be controlled by `ui.snapEnabled`.
- `locked=true` entities SHALL reject mutation.
- `visible=false` entities SHALL not render and SHOULD be excluded from hit testing.

---

## 8. Validation and Rule Enforcement

The app SHALL validate at least:
1. Every `interface.parentPartId` references an existing Part.
2. Every Part `interfaceIds[]` entry references an existing Interface owned by that Part.
3. Interface bounds remain within parent bounds.
4. Every Connector source/target interface exists.
5. Connector endpoint sides are valid side enums.
6. Rectangular entities respect minimum thresholds.
7. `ui.mode` is either `edit` or `review`.

Validation SHALL be callable from the top bar Validate action and SHOULD surface errors in the active context pane.

---

## 9. Functional Requirements by Prototype Mapping

- Part move behavior SHALL align with `movePart`.
- Part/note edge resize behavior SHALL align with `resizePartFromEdge` and `resizeNoteFromEdge`.
- Interface movement SHALL align with `moveInterfaceWithinPart`.
- Interface snapping SHALL align with `maybeSnapInterfaceToPartEdge`.
- Connector endpoint resolution SHALL align with `resolveConnectorEndpointSide` + dynamic side chooser.
- Connector reversal SHALL align with `reverseConnectorDirection`.
- Route selection SHALL align with `chooseBestConnectorRoute`.
- Esc behavior SHALL align with `handleEscToReviewMode`.

---

## 10. Acceptance Checklist

A release candidate is compliant when:
- [ ] `edit` and `review` are mutually exclusive.
- [ ] `Esc` cancels active operations, clears selection, and enters review mode.
- [ ] Wheel zoom and middle-mouse pan are implemented.
- [ ] External connectors route around entities and avoid crossing them.
- [ ] Internal connectors are allowed to cross.
- [ ] Connector endpoint sides/routes auto-update after dependent movements.
- [ ] Connector reversal impacts direction only.

---

## 11. CTQ Compliance Requirements (Normative)

This section maps the product behavior to `CTQs.md` and is mandatory for implementation and QA.

### 11.1 Edit commit and render consistency (CTQ A: 1-8)
- The app SHALL NOT require an Apply/Save-in-pane button for field edits.
- Field edits SHALL commit on edit-finish events (`blur`, `Enter`, picker close, drag-end).
- After commit, model state SHALL update in the same interaction cycle, then canvas render SHALL update immediately.
- Edit handlers SHALL scope mutations to the selected entity (or declared dependents only).
- The render pipeline SHALL prevent stale visuals after repeated edits (text, color, geometry, direction, arrowheads).
- Right pane values and canvas visuals SHALL remain synchronized after each commit.
- Save/reload SHALL preserve all committed values exactly.

### 11.2 Editable attributes and precedence (CTQ B: 9-15)
- Edit Mode SHALL show only editable attributes relevant to the selected entity type.
- Each entity type SHALL expose the complete intended editable set and SHALL NOT expose unintended/internal fields.
- Input constraints SHALL prevent invalid values (type, range, enum, referential integrity).
- Instance-level fields SHALL be editable independently per entity instance.
- Review Mode SHALL support editing document-level defaults (`settings`).
- When defaults and overrides coexist, instance overrides SHALL take precedence deterministically.
- Changes to inherited/default values SHALL propagate to all dependent entities immediately.
- Arrow size SHALL be editable per connector in Edit Mode (right pane) as an instance-level attribute.
- Document Settings SHALL expose a global arrow-size default; changing it SHALL update all arrows that do not define an instance override.
- Document Settings updates are global and SHALL reflect on the canvas immediately after commit.

### 11.3 Right-pane behavior (CTQ C: 16-20)
- Exactly one pane mode SHALL render at a time (`review` XOR `edit`).
- Review Mode SHALL present document settings above canvas summary.
- Edit Mode SHALL always target the current selection and only that selection’s fields.
- Any selection change SHALL immediately retarget Edit Mode content.
- Review summary counts/status SHALL reflect current model state after edits.

### 11.4 Geometry and direct manipulation (CTQ D: 21-26)
- Model state SHALL store `x`, `y`, `width`, `height` for applicable entities and persist them.
- Raw geometry inputs SHALL be hidden in normal Edit Mode where visual manipulation is the intended mechanism.
- Parts and notes SHALL support reliable move + edge resize with min-size enforcement.
- Interfaces SHALL be movable (within containment) and auto-sized from content, not manually resized.
- Text edits and font-related changes SHALL recompute auto-size geometry.
- All geometry operations SHALL preserve valid/non-corrupt rectangles and containment invariants.

### 11.5 Containment and snapping (CTQ E: 27-32)
- Interfaces SHALL remain fully contained in their parent part after any move/resize of either entity.
- Movement outside parent bounds SHALL be prevented by clamping or rejected mutation.
- Interfaces SHALL move freely inside allowed bounds when not snapped.
- Snap-enabled interfaces SHALL snap correctly to top/right/bottom/left edges within threshold.
- Snap interaction SHOULD be easy to trigger without overly restrictive behavior.
- Snapped state SHALL be represented consistently in model and rendered position.

### 11.6 Text and auto-sizing (CTQ F: 33-37)
- Text-bearing entities (part labels/interfaces/notes/connectors where applicable) SHALL be editable in pane controls.
- Text changes SHALL rerender immediately after edit-finish.
- Auto-sized entities SHALL resize to fit text and preserve readability.
- Multiline text SHALL remain readable and geometrically valid.
- Font-size/style changes SHALL rerender all affected text immediately.
- Interface label text SHALL be normalized to trim leading and trailing whitespace before persistence/rendering.

### 11.7 Connector logic, routing, and editable connector fields (CTQ G+H: 38-49)
- Connectors SHALL be classified as `internal` or `external` deterministically.
- Connection rules SHALL enforce valid/invalid interface linkage constraints.
- Endpoints SHALL attach only to valid interface midpoint candidates.
- Routing SHALL account for selected/resolved source+target sides and support multi-segment orthogonal paths.
- Routing SHALL choose shortest valid route under normal rules.
- External snapped-edge overrides SHALL supersede generic shortest-path choice when applicable.
- External routing SHALL treat entity bodies/labels as obstacles per rules.
- Connectors SHALL reroute after dependent geometry/text changes.
- Editable connector direction/arrowhead side/content/style fields SHALL rerender immediately upon commit.

### 11.8 Naming and identity integrity (CTQ I: 50)
- ID generation and derived naming conventions SHALL remain valid through create, edit, connect, delete, save, and reload flows.
