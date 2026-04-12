# Canvas App Requirements Specification

## 1. Purpose and Scope

This document defines the product requirements for the Canvas web app described in `canvasbp.md`, aligned with the data model and function model prototypes in `diagram-model-prototypes.md` and `diagram-model-prototypes.ts`.

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
Build a technical, geometry-aware editor for modeling structured diagrams with predictable behavior, strict containment, and rule-driven routing.

### 2.2 Non-Goals
- Freeform whiteboarding behavior as the default experience.
- DOM-only geometry calculations without backing model state.
- Multiple conflicting interaction modes active at the same time.

---

## 3. Information Architecture and UI Layout

### 3.1 Global Layout
The UI SHALL include:
1. **Top Bar** with: File, Edit, View, Zoom, Snap, Validate, Export, and Review/Edit Toggle.
2. **Left Pane** actions: Add Part, Add Interface, Add Note, Delete Entity, Reset Canvas.
3. **Center Canvas** as SVG render area with grid/guides and connector display.
4. **Right Pane** that displays exactly one mode at a time: Review mode or Edit mode.
5. **Status Bar** showing cursor x/y, zoom, selection count, snap state, and hovered element.

### 3.2 Mode Exclusivity
- UI SHALL enforce mutual exclusivity of modes: `edit` XOR `review`.
- Any mode switch SHALL update `ui.mode` in the document model before re-render.

---

## 4. Core Design Principles (Normative)

1. **Model First**: All user actions update document state first.
2. **Derived Rendering**: SVG output is fully derived from state.
3. **Deterministic Geometry**: Midpoints, bounds, snapping, and routing derive from shared geometric rules.
4. **Single Source of Truth**: No conflicting state copies between model and SVG/DOM.
5. **Structured UX**: Interaction fidelity should prioritize technical precision over sketch-like looseness.

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

### 5.3 Settings Baseline
At minimum, settings SHALL include:
- `arrowSize`
- `interfaceArrowSize`
- `interfaceFillColor`
- `partIdFontSize`

---

## 6. Entity Requirements

## 6.1 Part Requirements

### Functional
- A Part SHALL be movable on the canvas.
- A Part SHALL be resizable from top/right/bottom/left edges.
- Resizing SHALL enforce minimum dimensions.
- A Part SHALL maintain a list of child interfaces (`interfaceIds`).

### Geometry
- Part geometry SHALL be explicit in model state (`x,y,width,height`).
- Part bounds SHALL be used to constrain contained interfaces.

### Styling and Text
A Part SHALL expose:
- `style`: fill, stroke, strokeWidth, cornerRadius
- `textStyle`: partIdFontSize, interfaceFontSize, interfaceFillColor

### Containment
- Interfaces SHALL remain fully contained within their parent Part after drag/resize operations.

## 6.2 Interface Requirements

### Identity and Ownership
- An Interface SHALL belong to exactly one Part (`parentPartId`).
- An Interface SHALL expose `interfaceId` and display label text.

### Sizing
- Interface size SHALL be derived from label text + padding + line-height rules.
- Manual resize of interfaces SHALL NOT be supported.
- `layout.maxWidth` SHOULD support multiline wrapping strategies.

### Placement and Snapping
- Interface movement SHALL be constrained to parent bounds.
- Edge snapping to parent edges SHALL be supported (`top|right|bottom|left`).
- Snapping SHALL be proximity-based with a configurable threshold.
- If no edge is within threshold, snapped-edge state SHALL be cleared.

### Endpoint Semantics
- Interfaces SHALL be valid connector endpoints through edge midpoint candidates.

## 6.3 Connector Requirements

### Topology
- Connector SHALL reference source and target interfaces with preferred endpoint sides.
- Connector kind SHALL support `internal` and `external`.

### Directionality
- Connector SHALL support arrow direction modes: none/source/target/both.
- Reversing a connector SHALL swap source and target and remap directional arrow semantics.

### Routing
- Routing model SHALL support orthogonal segments.
- Route selection SHALL follow a deterministic candidate generation + filtering + scoring process.

### Endpoint Resolution Rule
- For `external` connectors, if an interface is snapped to a part edge, that edge SHALL override requested side during endpoint resolution.

## 6.4 Note Requirements

- Notes SHALL be rectangular movable entities with text and style settings.
- Notes SHALL support edge-based resize with minimum dimensions.

---

## 7. Shared Geometry and Computation Requirements

The application SHALL provide reusable geometry operations:
- Bounds extraction (`getBounds`)
- Center computation (`getCenter`)
- Edge midpoint extraction for each side (`getEdgeMidpoint`)
- All-side midpoint set derivation (`getAllEdgeMidpoints`)

Rectangular side semantics MUST be consistent for Part, Interface, and Note.

---

## 8. Interaction and State-Transition Requirements

## 8.1 General Interaction Loop
For every user action:
1. Validate action against rules (lock state, containment, mode).
2. Update model state.
3. Recompute derived geometry/routing as needed.
4. Re-render SVG from updated model.

## 8.2 Selection and Hover
- System SHALL support multi-selection tracking in `ui.selection`.
- Hovered entity SHALL be represented by `ui.hoveredId`.

## 8.3 Snap Behavior
- Global snap enablement SHALL be controlled via `ui.snapEnabled`.
- If disabled, snapping functions SHALL not force edge attachment.

## 8.4 Lock and Visibility
- `locked=true` entities SHALL reject mutating interaction operations.
- `visible=false` entities SHALL not render and SHOULD be excluded from hit testing.

---

## 9. Validation and Rule Enforcement

The app SHALL validate at least the following invariants:

1. Every `interface.parentPartId` references an existing Part.
2. Every Part `interfaceIds[]` entry references an existing Interface owned by that Part.
3. Interface bounds remain within parent part bounds.
4. Every Connector source/target interface exists.
5. Connector endpoint sides are valid side enums.
6. All rectangular entities maintain non-negative width/height and minimum thresholds where applicable.
7. `ui.mode` is either `edit` or `review`.

Validation SHALL be callable from the top bar Validate action and SHOULD surface errors in review/edit context.

---

## 10. Functional Requirements by Prototype Mapping

### 10.1 Movement and Resizing
- Part move behavior SHALL align with `movePart`.
- Part/note edge resize behavior SHALL align with `resizePartFromEdge` / `resizeNoteFromEdge`.
- Interface movement SHALL align with `moveInterfaceWithinPart` and containment clamping.

### 10.2 Text Measurement and Interface Layout
- Interface auto-size SHALL align with `measureTextWidth` and `layoutInterfaceSize`.
- Non-browser environments SHOULD provide a deterministic text width fallback.

### 10.3 Snapping
- Interface edge snapping SHALL align with `maybeSnapInterfaceToPartEdge`.

### 10.4 Connector Behavior
- Endpoint resolution SHALL align with `resolveConnectorEndpointSide` + `getConnectorEndpoints`.
- Connector reversal SHALL align with `reverseConnector`.
- Route selection SHALL implement the contract represented by `chooseBestConnectorRoute`.

### 10.5 Handler Registry
System SHOULD expose an entity handler registry by type to unify behavior dispatch for movement, bounds, routing, and layout.

---

## 11. Export, Persistence, and Determinism

- Serialized document output SHALL include all source geometry and relationship data needed to reconstruct the exact diagram.
- Derived render artifacts (e.g., transient DOM values) SHALL NOT be the only persisted source.
- Given equivalent model input, render and route results SHOULD be reproducible and deterministic.

---

## 12. Usability and Performance Requirements

- Drag, resize, and snap operations SHOULD feel real-time at standard zoom levels.
- Re-render pipeline SHOULD avoid full recomputation when only local entities change.
- Zoom and status-bar telemetry SHOULD update continuously with pointer interactions.

---

## 13. Implementation Checklist (Acceptance-Oriented)

A release candidate is considered compliant when:

- [ ] DocumentModel schema is implemented and validated.
- [ ] Part/interface/connector/note entity behaviors match prototype contracts.
- [ ] Interface auto-sizing and bounded movement are implemented.
- [ ] Edge snapping and snapped-edge state are implemented.
- [ ] Connector endpoint resolution and reversal are implemented.
- [ ] Orthogonal routing pipeline exists with deterministic candidate selection.
- [ ] UI mode exclusivity is enforced.
- [ ] Validate action reports rule violations.
- [ ] Export/persistence round-trips without geometry loss.
- [ ] SVG fully reflects model state transitions.

---

## 14. Traceability Sources

This requirements specification is derived from:
- `canvasbp.md` (product behavior and UI architecture)
- `diagram-model-prototypes.md` (document/entity/function prototypes)
- `diagram-model-prototypes.ts` (typed model and function contracts)
