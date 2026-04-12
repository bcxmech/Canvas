# UI Layout Specification (Envisioned Canvas App)

This document translates the product requirements and model prototypes into a concrete UI layout for the SVG canvas app.

## 1) Primary Application Shell

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Bar: File | Edit | View | Zoom | Snap | Validate | Export | Mode: [Edit ↔ Review]      │
├──────────────────────┬────────────────────────────────────────────────┬───────────────────────┤
│ Left Action Pane     │ Main Workspace                                 │ Right Context Pane    │
│ (Creation/Canvas Ops)│                                                │ (Mutually Exclusive)  │
│                      │                SVG Canvas                      │                       │
│ + Add Part           │          ┌───────────────────────┐             │ Edit Mode OR          │
│ + Add Interface      │          │ grid / guides         │             │ Review Mode           │
│ + Add Note           │          │ parts/interfaces       │             │ (never both together) │
│ + Delete Entity      │          │ connectors/notes       │             │                       │
│ + Reset Canvas       │          └───────────────────────┘             │                       │
├──────────────────────┴────────────────────────────────────────────────┴───────────────────────┤
│ Status Bar: cursor(x,y) | zoom | snap:on/off | hover target | selection count                │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Layout intent
- **Top bar**: global commands and mode switching.
- **Left pane**: creation + destructive canvas actions.
- **Center**: single source of interaction (drag/resize/connect).
- **Right pane**: context-driven editor/inspector (exclusive mode).
- **Status bar**: real-time geometry and interaction telemetry.

---

## 2) Top Bar Structure

```text
[File▼] [Edit▼] [View▼] [Zoom - | 100% | +] [Snap: ON/OFF] [Validate] [Export▼] [Mode Toggle]
```

### Behavior
- **Mode Toggle** flips right pane between **Edit** and **Review**.
- **Snap toggle** immediately affects drag/snap behavior.
- **Validate** runs model/geometry/routing checks and reports results.
- **Export** supports outputs (e.g., SVG/image/model payload).

---

## 3) Left Action Pane (Tool Actions)

```text
┌──────────────────────────┐
│ CREATE                   │
│  • Add Part              │
│  • Add Interface         │
│  • Add Note              │
│                          │
│ CANVAS ACTIONS           │
│  • Delete Entity         │
│  • Reset Canvas          │
└──────────────────────────┘
```

### Interaction notes
- Actions are explicit buttons (not hidden in floating menus).
- `Add Interface` requires a selected parent part (or prompts to pick one).
- `Delete Entity` targets current selection.
- `Reset Canvas` is destructive and should require confirmation.

---

## 4) Right Context Pane (Exclusive Modes)

## 4.1 Edit Mode

Shows only fields for the selected item.

```text
┌─────────────────────────────────────┐
│ Edit Mode                           │
├─────────────────────────────────────┤
│ Selected: part:partA                │
│                                     │
│ Editable Fields                     │
│ - part_id                           │
│ - fill color                        │
│ - part id font size                 │
│ - interface font size               │
│ - interface fill color              │
│                                     │
│ Geometry is direct-manipulation     │
│ (x/y/w/h hidden from standard edit) │
└─────────────────────────────────────┘
```

## 4.2 Review Mode

Shows document-level settings and state summary.

```text
┌─────────────────────────────────────┐
│ Review Mode                         │
├─────────────────────────────────────┤
│ Document Settings                   │
│ - arrowSize                         │
│ - interfaceArrowSize                │
│ - interfaceFillColor                │
│ - partIdFontSize                    │
│                                     │
│ Canvas Summary                      │
│ - # Parts                           │
│ - # Interfaces                      │
│ - # Connectors                      │
│ - # Notes                           │
│ - Validation status                 │
└─────────────────────────────────────┘
```

### Mode rule
- Right pane must render **exactly one** mode at a time.

---

## 5) Canvas Interaction Model (UI Perspective)

## 5.1 Part on Canvas

```text
┌────────────────────────────────────┐
│ partA                              │
│                                    │
│   ┌──────────────┐                 │
│   │ partA_inf1   │                 │
│   └──────────────┘                 │
│                                    │
└────────────────────────────────────┘
```

- Drag body to move.
- Drag edges/corners to resize.
- Selection state shows handles/highlight.

## 5.2 Interface Placement States

Free placement:

```text
┌────────────────────────────────────┐
│ partA                              │
│      ┌──────────────┐              │
│      │ partA_inf1   │              │
│      └──────────────┘              │
└────────────────────────────────────┘
```

Snapped to part edge (example left):

```text
┌────────────────────────────────────┐
│ partA                              │
├──────────────┐                     │
│ partA_inf1   │                     │
└──────────────┘                     │
└────────────────────────────────────┘
```

- Interfaces auto-size to label text.
- Interfaces stay fully inside parent part bounds.

## 5.3 Connector Visual Rules

```text
interface A (right mid) ──┐
                          ├── orthogonal route ──▶ interface B (left mid)
note/part obstacles      ─┘
```

- Endpoints attach to valid interface edge-midpoint candidates.
- Route prefers shortest valid orthogonal path.
- Snapped-edge routing may override default shortest route.

---

## 6) Status Bar Specification

```text
cursor: (x,y) | zoom: 125% | snap: on | hover: interface:partA_inf1 | selected: 2
```

### Purpose
- Supports precision editing feedback.
- Mirrors interaction state from the model/UI layer.

---

## 7) Interaction Lifecycle (Edit Commit)

```text
User action on canvas/right pane
        ↓
Edit finishes (blur/enter/drag-end)
        ↓
Document model updates (source of truth)
        ↓
SVG rerenders affected entities
        ↓
Right pane + status bar remain synchronized
```

This ensures no “Apply” button workflow and avoids stale visual state.

---

## 8) Responsive/Scaling Guidance

- Keep top bar and status bar fixed-height.
- Panes are fixed or min/max width; center canvas expands fluidly.
- On smaller screens, left pane can collapse to icons; right pane can become a drawer.
- Canvas zoom should be independent from browser zoom.

---

## 9) UI Acceptance Checklist (Condensed)

- Right pane exclusivity: Edit **xor** Review.
- Edit commits update model + canvas immediately.
- Entity-specific editable fields only.
- Geometry primarily through direct manipulation.
- Containment and snapping feel deterministic.
- Connector routing updates after dependent moves/edits.
- Status bar always reflects current interaction state.
