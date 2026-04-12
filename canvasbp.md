Canvas Web App Specification (SVG-Based, Data-First)

1. Product idea

This is a structured canvas web app rendered with SVG.
The document data model is the source of truth.
SVG is only the rendering layer.

The app is meant for building diagrams composed of:
- Parts
- Interfaces
- Connectors
- Notes

The system is geometry-aware, rule-driven, and interactive.
Users manipulate shapes visually on the canvas.
The application updates the underlying model, then re-renders the SVG view.

──────────────────────────────────────────────────────────────────────────────

2. Core application layout

┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar: File  Edit  View  Zoom  Snap  Validate  Export  Review/Edit Toggle │
├──────────────────┬──────────────────────────────────────────┬────────────────┤
│ Left pane        │                                          │ Right pane     │
│                  │              SVG Canvas Area             │                │
│ Add Part         │                                          │ Either:        │
│ Add Interface    │      grid / guides / connectors          │ Review Mode    │
│ Add Note         │                                          │ or Edit Mode   │
│ Delete Entity    │                                          │ never both     │
│ Reset Canvas     │                                          │ at once        │
├──────────────────┴──────────────────────────────────────────┴────────────────┤
│ Status bar: x/y | zoom | selection count | snap | hovered element           │
└──────────────────────────────────────────────────────────────────────────────┘

Top bar:
- file actions
- edit actions
- zoom controls
- snap toggle
- validation
- export
- review/edit mode toggle

Left pane actions:
- Add Part
- Add Interface
- Add Note
- Delete Entity
- Reset Canvas

Right pane:
- shows only one mode at a time
- either Review Mode or Edit Mode
- never both at once

Status bar:
- cursor position
- zoom level
- snap state
- hovered entity
- selected entity info

──────────────────────────────────────────────────────────────────────────────

3. Design principles

- The YAML-style document model is the source of truth
- SVG is the rendering surface only
- Geometry lives in application state, not only in the DOM
- User interactions update the model first
- Rendering reflects the model
- Routing and geometry rules must be deterministic and consistent
- The editor should feel structured and technical, not loose like a whiteboard

──────────────────────────────────────────────────────────────────────────────

4. Shared geometry model

All rectangular entities have:
- x
- y
- width
- height

These values exist in the data model even if they are not directly shown in the UI.

All rectangular entities also conceptually expose:
- top edge
- right edge
- bottom edge
- left edge
- midpoint of each edge

This rectangle geometry model applies to:
- Parts
- Interfaces
- Notes

These edge midpoints matter because:
- Parts resize through edges
- snapping is edge-based
- Connectors attach through midpoint candidates
- routing uses midpoint and edge information

Important UI rule:
- users do not need to edit raw x, y, width, height in the right pane
- geometry is mainly changed by direct manipulation
- resizing handles
- dragging
- automatic sizing in the case of Interfaces

──────────────────────────────────────────────────────────────────────────────

5. Entities

5.1 Part

A Part is the main rectangular container entity.

Visual behavior:
- rectangular
- slightly rounded corners if desired
- white or configurable fill
- visible border
- label shown as the Part ID
- can contain Interfaces

Geometry behavior:
- Part stores x, y, width, height
- Part can be moved
- Part can be resized by dragging its edges
- edge dragging updates width and height

Containment behavior:
- Interfaces belong to a Part
- Interfaces must remain inside their parent Part

Part editable instance attributes:
- part_id
- interface_ids
- fill color
- part id font size
- interface font size
- interface fill color

Meaning:
- a Part instance can define its own appearance
- a Part can also define appearance values relevant to the Interfaces it owns

Example:
┌────────────────────────────────────┐
│ partA                              │
│                                    │
│   ┌──────────────┐                 │
│   │ partA_inf1   │                 │
│   └──────────────┘                 │
│                                    │
└────────────────────────────────────┘

5.2 Interface

An Interface is a rectangular child entity inside a Part.

Purpose:
- render an interface label
- serve as a valid connector endpoint

Geometry behavior:
- Interface stores x, y, width, height in the data model
- Interface cannot be manually resized
- Interface automatically resizes itself to fit its text content
- width and height are derived from text, padding, and line layout

Placement behavior:
- Interface must belong to exactly one Part
- Interface must stay fully inside its parent Part
- Interface can move freely inside the Part
- Interface is intended to snap to Part edges
- edge snapping is preferred but not mandatory
- edge attachment usually gives the best visual meaning

Snapping behavior:
- Interface may snap to top, right, bottom, or left edge of its Part
- snapping is triggered when moved near an edge
- user can still keep it detached inside the Part

Visual behavior:
- rectangular label box
- text inside is the interface label
- auto-sized to fit text
- may become multiline if needed

Example free placement:
┌────────────────────────────────────┐
│ partA                              │
│                                    │
│    ┌──────────────┐                │
│    │ partA_inf1   │                │
│    └──────────────┘                │
│                                    │
│                ┌──────────────┐    │
│                │ partA_inf2   │    │
│                └──────────────┘    │
│                                    │
└────────────────────────────────────┘

Example snapped to left edge:
┌────────────────────────────────────┐
│ partA                              │
│                                    │
├──────────────┐                     │
│ partA_inf1   │                     │
└──────────────┘                     │
│                                    │
└────────────────────────────────────┘

Example snapped to right edge:
┌────────────────────────────────────┐
│ partA                              │
│                                    │
│                     ┌──────────────┤
│                     │ partA_inf1   │
│                     └──────────────┤
│                                    │
└────────────────────────────────────┘

5.3 Connector

A Connector is a path or arrow connecting Interfaces.

Connector categories:
- Internal Connector
- External Connector

General behavior:
- may be directional
- may be multi-segment
- direction can be changed by the user after creation
- arrow head side is editable
- routing is computed by an optimized path algorithm
- route aims for the shortest valid path
- routing uses midpoint candidates on interface rectangles
- routing accounts for obstacles

Connector editable instance attributes:
- multiline content field
- arrow head side
- connector color

Attachment behavior:
- Connectors attach through edge midpoints
- route computation must consider source midpoint and target midpoint
- midpoint side selection affects final route

5.3.1 Internal Connector

Internal Connector definition:
- connects two Interfaces belonging to the same Part

Behavior:
- may be straight or segmented
- may overlap the owning Part’s internal area
- may cross internal multiline labels if necessary
- routing is more permissive than external routing

Example:
┌────────────────────────────────────────────────────────┐
│ partA                                                  │
│                                                        │
├──────────────┐                                         │
│ partA_inf1   │──────→──────┐                           │
└──────────────┘             │                           │
│                            │                           │
│                     ┌──────↓───────┐                   │
│                     │ partA_inf2   │                   │
│                     └──────────────┘                   │
│                                                        │
└────────────────────────────────────────────────────────┘

5.3.2 External Connector

External Connector definition:
- connects two Interfaces belonging to different Parts

Behavior:
- may be straight or segmented
- uses shortest valid route unless snapped-edge rules override it
- should avoid crossing other entity bodies
- may cross labels of other entities
- labels are not hard obstacles

Example:
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ partA                        │        │ partB                        │
│                              │        │                              │
│                     ┌────────┤        ├────────┐                     │
│                     │ partA_ │────────→ partB_ │                     │
│                     │ inf1   │        │ inf1   │                     │
│                     └────────┤        ├────────┘                     │
│                              │        │                              │
└──────────────────────────────┘        └──────────────────────────────┘

5.3.3 Snapped-edge override for external routing

If an Interface is snapped to a specific edge of its Part, and an external Connector uses it:
- the route must originate from that snapped edge side
- this overrides a purely shortest-path choice

Example:
- if partA_inf1 is snapped to the right edge of partA
- and it connects externally to partB_inf1
- the route begins from the right side even if another side would be shorter

Example:
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ partA                        │        │ partB                        │
│                              │        │                              │
│                     ┌────────┤        │                              │
│                     │ partA_ │────┐   │                              │
│                     │ inf1   │    │   │   ┌────────┐                 │
│                     └────────┤    └───┼──→│ partB_ │                 │
│                              │        │   │ inf1   │                 │
└──────────────────────────────┘        │   └────────┘                 │
                                        └──────────────────────────────┘

5.4 Note

A Note is a secondary annotation entity.

Behavior:
- rectangular
- stores x, y, width, height
- can be moved
- can be resized by dragging edges
- contains text
- shares the same edge and midpoint geometry model as Parts and Interfaces

──────────────────────────────────────────────────────────────────────────────

6. Naming conventions

6.1 Part IDs

Each Part has an ID such as:
- partA
- partB
- partX

The Part ID is used in displayed labels and interface naming.

6.2 Interface IDs

Interface IDs are created automatically.
Numbering starts from 1 for each Part.

Pattern:
- <part_id>_inf<number>

Examples:
- for partA:
  - partA_inf1
  - partA_inf2
  - partA_inf3

- for partB:
  - partB_inf1
  - partB_inf2

Rule:
- numbering is local to the owning Part
- interface count resets per Part

6.3 Part-to-Part relationship naming

If an interface in one Part connects to an interface in another Part, each Part gets a relationship-style name to represent the connected Part pair.

If:
- partX_infY connects to partB_infN

Then:
- source-side relationship name = partX_partB
- target-side relationship name = partB_partX

Example:
- partA_inf2 connected to partB_inf1
- relationship names:
  - partA_partB
  - partB_partA

Important distinction:
- Interface ID = endpoint identity
- Part-to-Part relationship name = connected Part pair identity

If multiple connectors exist between the same Part pair:
- the interface IDs remain unique per interface
- the relationship naming still stays at Part-pair level

Example:
- partA_inf1 → partB_inf1
- partA_inf2 → partB_inf2

Still:
- partA_partB
- partB_partA

──────────────────────────────────────────────────────────────────────────────

7. Routing rules

Connector routing must use an optimized path algorithm.

The algorithm should consider:
- source interface midpoint candidates
- target interface midpoint candidates
- shortest valid route
- entity obstacles
- snapped-edge overrides
- connector type: internal vs external

7.1 Midpoint-based routing

Each rectangle has four edge midpoint candidates:

            top midpoint
                 ▲
                 │
        ┌─────────────────┐
left ◄──│    rectangle    │──► right
midpoint└─────────────────┘ midpoint
                 │
                 ▼
           bottom midpoint

Connectors attach through midpoint candidates.
The algorithm chooses the midpoint combination that best satisfies the rules.

7.2 Obstacle rules

External connectors:
- avoid crossing rendered entity bodies
- may cross labels
- labels are not hard obstacles

Internal connectors:
- may overlap the owning Part interior
- may cross internal multiline labels
- more permissive than external connectors

7.3 Direction behavior

Connector direction is editable.
The user may reverse source and target.

When reversed:
- arrowhead placement updates
- source/target references update
- route may be recomputed if needed

──────────────────────────────────────────────────────────────────────────────

8. Geometry editing rules

Raw geometry fields exist in the data model but are not primary UI controls.

Part geometry:
- changed by moving
- changed by dragging edges

Interface geometry:
- changed by moving
- changed automatically by text sizing
- not manually resized

Note geometry:
- changed by moving
- changed by dragging edges

Connector geometry:
- derived from endpoints and routing data
- may also include path segments in the model
- visually edited through handles and rerouting, not raw coordinate fields

──────────────────────────────────────────────────────────────────────────────

9. Right pane behavior

The right pane shows only one mode at a time:
- Review Mode
- Edit Mode

Mode switching rule:
- after an edit action completes, clicking empty canvas space (no entity hit)
  clears selection and immediately switches the right pane to Review Mode
- clicking an entity switches the right pane to Edit Mode for that selection

9.1 Review Mode

Review Mode shows:
1. Document-wide editable settings
2. Canvas summary

Document-wide editable settings appear above the canvas summary.

Document-wide editable features:
- arrow size
- interface arrow size
- interface background / fill color
- part id font size

These are global document-level settings.
They act as shared defaults or shared presentation rules.

Review Mode layout:
+----------------------------------+
| Document Settings                |
| - Arrow Size                     |
| - Interface Arrow Size           |
| - Interface Fill Color           |
| - Part ID Font Size              |
|----------------------------------|
| Canvas Summary                   |
| - Parts: n                       |
| - Interfaces: n                  |
| - Internal Connectors: n         |
| - External Connectors: n         |
| - Notes: n                       |
+----------------------------------+

Canvas summary may include:
- number of Parts
- number of Interfaces
- number of Internal Connectors
- number of External Connectors
- number of Notes
- list of Parts and their Interfaces
- list of connections
- validation warnings

9.2 Edit Mode

Edit Mode shows only the editable properties for the selected entity.
It does not show the review summary.

Edit Mode examples:

Selected Part:
+----------------------------------+
| Part Properties                  |
| - Part ID                        |
| - Interface IDs                  |
| - Fill Color                     |
| - Part ID Font Size              |
| - Interface Font Size            |
| - Interface Fill Color           |
+----------------------------------+

Selected Connector:
+----------------------------------+
| Connector Properties             |
| - Multiline Content              |
| - Arrow Head Side                |
| - Connector Color                |
+----------------------------------+

Selected Interface:
+----------------------------------+
| Interface Properties             |
| - Label                          |
| - Allowed style fields           |
| - Auto-sized by text             |
+----------------------------------+

Selected Note:
+----------------------------------+
| Note Properties                  |
| - Note Text                      |
| - Allowed style fields           |
+----------------------------------+

Important UI rule:
- geometry numbers such as x, y, width, height are usually hidden
- users manipulate geometry directly on the canvas

──────────────────────────────────────────────────────────────────────────────

10. Instance-level vs document-level styling

10.1 Instance-level styling

Entity instances may each carry their own editable visual values.

Examples:
- Part fill color
- Connector color
- Connector arrow head side
- Part ID font size on a specific Part
- Interface fill color on a specific Part’s owned interface appearance

These are per-instance overrides.

10.2 Document-level styling

The document also stores shared editable defaults.

Examples:
- arrow size
- interface arrow size
- interface background / fill color
- part id font size

These appear in Review Mode above the canvas summary.

Meaning:
- document-level settings provide global defaults or shared rules
- instance-level settings may override them where the model permits

──────────────────────────────────────────────────────────────────────────────

11. Interaction model

Selection:
- click to select
- shift-click for multi-select
- click empty canvas space after an action completes to clear selection and
  activate Review Mode

Movement:
- drag Parts to move them
- drag Notes to move them
- drag Interfaces to move them inside their parent Parts

Resizing:
- drag Part edges to resize Parts
- drag Note edges to resize Notes
- Interfaces do not resize manually

Text editing:
- double-click text-bearing entities to edit text
- Interface size updates automatically after text changes

Connector creation:
- drag from one Interface to another Interface
- if both Interfaces belong to same Part → internal connector
- if they belong to different Parts → external connector

Connector editing:
- reverse direction
- update arrow head side
- update content
- update connector color

Snapping:
- Interface edge snapping occurs when near a Part edge
- snapping is visible and encouraged
- snapped edge affects external routing

Canvas actions:
- add Part
- add Interface
- add Note
- delete selected entity
- reset canvas

Navigation:
- pan
- zoom

──────────────────────────────────────────────────────────────────────────────

12. Validation rules

- every Interface belongs to exactly one Part
- every Interface must stay fully inside its parent Part
- Interfaces may move freely inside their parent Part
- Interfaces should support snapping to Part edges
- Parts can be resized by dragging edges
- Notes can be resized by dragging edges
- Interfaces cannot be manually resized
- Interfaces auto-size to fit label content
- Connectors attach through edge midpoint candidates
- Internal Connectors connect Interfaces in the same Part
- External Connectors connect Interfaces in different Parts
- Connectors may be multi-segment
- Connector direction is editable
- external routing avoids entity bodies
- external routing may cross labels
- internal routing may cross owning Part interior and multiline labels
- snapped-edge routing overrides generic shortest-path preference for external connectors
- entity geometry must remain valid after moves and resizing
- IDs and naming conventions must remain consistent

──────────────────────────────────────────────────────────────────────────────

13. Data model overview

Document
- settings
- parts
- interfaces
- connectors
- notes
- selection
- viewport
- ui
- rules/config

Suggested structure:

document
 ├─ settings
 │   ├─ arrow_size
 │   ├─ interface_arrow_size
 │   ├─ interface_fill_color
 │   └─ part_id_font_size
 ├─ parts
 ├─ interfaces
 ├─ connectors
 ├─ notes
 ├─ selection
 ├─ viewport
 ├─ ui
 │   ├─ right_pane_mode
 │   └─ active_tool
 └─ rules

Part model concept
- id
- x
- y
- width
- height
- interface_ids
- fill_color
- part_id_font_size
- interface_font_size
- interface_fill_color

Interface model concept
- id
- parent_part_id
- x
- y
- width
- height
- label
- snapped_edge optional
- style fields as allowed

Connector model concept
- id
- type internal/external
- source_interface_id
- target_interface_id
- source_midpoint
- target_midpoint
- direction
- segments or path data
- multiline_content
- arrow_head_side
- connector_color
- relationship names if needed:
  - source_relation_name
  - target_relation_name

Note model concept
- id
- x
- y
- width
- height
- text
- style fields

──────────────────────────────────────────────────────────────────────────────

14. Combined Unicode example

┌────────────────────────────────────┐         ┌────────────────────────────────────┐
│ partA                              │         │ partB                              │
│                                    │         │                                    │
├──────────────┐                     │         │                     ┌──────────────┤
│ partA_inf1   │────→────┐           │         │                     │ partB_inf1   │
└──────────────┘         │           │         │                     └──────────────┤
│                        │           │         │                                    │
│        ┌──────────────┐│           │         │                                    │
│        │ partA_inf2   │┘           │         │                                    │
│        └──────────────┘            │         │                                    │
│                     external ──────┼────────→│                                    │
│                     relation:      │         │ relation:                          │
│                     partA_partB    │         │ partB_partA                        │
└────────────────────────────────────┘         └────────────────────────────────────┘

What this shows:
- partA_inf1 and partA_inf2 are interfaces inside partA
- partA_inf1 to partA_inf2 is an internal connector
- partA_inf2 to partB_inf1 is an external connector
- interface naming uses the Part-based convention
- relationship naming uses the Part-pair convention
- snapped interfaces are attached visually to edges
- external routing starts from snapped edge side when applicable

──────────────────────────────────────────────────────────────────────────────

15. Final summary

This canvas app is a structured SVG diagram editor built on a data-first model.

Its main rules are:
- Parts are resizable containers
- Interfaces are child rectangles inside Parts
- Interfaces move freely but prefer edge snapping
- Interfaces auto-size to fit their text
- Connectors are internal or external paths/arrows
- Connectors attach through edge midpoints
- Connectors use obstacle-aware optimized routing
- external routing avoids entity bodies but may cross labels
- internal routing is more permissive
- interface IDs are auto-generated per Part:
  - partA_inf1
  - partA_inf2
- cross-part relationships derive Part-pair names:
  - partA_partB
  - partB_partA
- the left pane is for canvas actions
- the right pane shows either review or edit, never both
- Review Mode shows document-wide settings above the canvas summary
- Edit Mode shows selected-entity editable properties
- geometry values exist in the model but are mostly manipulated visually instead of being typed by the user

This gives you a consistent, rule-based, and visually understandable systems-style diagram editor.
