# Diagram Editor Requirements

## Export Functionality

- The system shall export a vector representation of the current diagram state as SVG.
- The system shall export the entire diagram as a high-resolution PNG.
  - Output resolution must be 600 dpi.
  - The export area must be computed using an invisible envelope boundary that covers all rendered elements.
- The system shall export the currently visible viewport as a high-resolution PNG.
  - Output resolution must be 600 dpi.

## Interaction Behavior

- Zoom in and zoom out shall be controlled via middle mouse scrolling.
- Panning shall be performed using middle mouse click and drag.
- Centering the selection shall be triggered by pressing Space while an entity is selected.

## Top Pane Features

- The top pane shall provide the following actions:
  - New
  - Save
  - Load
  - Export SVG
  - Export Canvas (600 dpi PNG using full envelope)
  - Export View (600 dpi PNG of visible viewport)
  - Undo
  - Redo
  - Zoom In
  - Zoom Out
  - Fit
  - Grid toggle

## External Interface Naming Rules

- When a connection is created between two parts:
  - The interface on PartA shall be named "PartA_PartB".
  - The interface on PartB shall be named "PartB_PartA".

## Tree View Behavior

- The tree shall reflect the current diagram model at all times.
- Selecting an item in the tree shall select the corresponding entity on the canvas.
- Deleting an entity shall immediately update the tree.
- The tree structure shall mirror the diagram structure.

## Canvas and UI Behavior

- Clicking on an empty canvas shall switch the application to REVIEW mode.
- Selecting an entity shall switch the application to EDIT mode.
- Pressing Escape shall return the application to REVIEW mode.
- Zoom, pan, fit, and grid controls shall be accessible from the top pane.

## State Machine

- REVIEW state:
  - Selecting an entity transitions to EDIT.
  - Invoking tools (AddPart, AddInterface, AddConnector, AddNote) triggers tool flow.
  - Clicking empty canvas keeps the state in REVIEW.
  - Pressing Escape keeps the state in REVIEW.
- EDIT state:
  - Clicking empty canvas transitions to REVIEW.
  - Pressing Escape transitions to REVIEW.
  - Selecting another entity keeps the state in EDIT.

## Layout and Scrolling Behavior

- The left pane and right pane shall not be scrollable.
- Scrolling actions (e.g., zoom via mouse scroll) must not cause pane scrolling.
- Layout must be adjusted to prevent accidental pane scrolling during canvas interactions.

## Shape and Styling Requirements

- Parts and interfaces shall be rendered as rectangular (boxy) shapes.
- A global configuration shall control corner radius:
  - Default part corner radius: 2px
  - Default interface corner radius: 2px

## Visual Design System

- The canvas background shall be white.
- The application shall use a modern color palette:
  - White background
  - Gray and black text
  - Blue and dark blue for accents and interactions

## Left Pane Interaction Feedback

- When a user clicks a button in the left pane, a clear visual indication shall be shown.
- Visual feedback may include:
  - Border color change
  - Shadow or elevation effect
- The design shall follow modern UI/UX practices to ensure clear affordance.

## Connector Behavior

- Multi-segment connectors shall consist of orthogonal (horizontal/vertical) segments only.
- Angled segments shall not be generated under any condition.
- Connector routing logic must enforce strict right-angle paths.
