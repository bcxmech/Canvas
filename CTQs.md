Bucketed Critical-to-Quality Checks for the SVG Canvas Web App

A. Edit Commit and Rendering

1. No Apply button
Are right-pane edits committed without requiring an Apply button?

2. Commit on edit finish
When editing is finished, is the new value committed automatically?

3. Immediate model update
After editing is finished, does the document model update immediately?

4. Immediate canvas render
After editing is finished, does the affected canvas rendering update immediately?

5. Correct target update
Does the edit affect only the intended entity or intended dependent entities?

6. No stale visuals
After repeated edits, does the canvas avoid stale text, stale color, stale geometry, or stale connector direction?

7. Right-pane consistency
After an edit, do the right pane and canvas remain consistent with each other?

8. Save/reload persistence
After save and reload, do committed edits remain correct?

B. Editable Attributes Across Entities

9. Editable attribute visibility
Does the right pane show only the editable attributes relevant to the currently selected entity?

10. Editable attribute completeness
Does each entity expose all intended editable attributes and no unintended ones?

11. Editable attribute validity
Are invalid attribute values prevented, corrected, or constrained safely?

12. Instance-level editing
Can instance-level attributes be edited independently per entity instance?

13. Document-level editing
Can document-wide editable attributes be edited correctly in Review Mode?

14. Override precedence
When both document-level defaults and instance-level overrides exist, is precedence applied consistently?

15. Propagation of inherited values
When a parent-level or document-level attribute changes, do all affected dependent entities update correctly?

C. Right Pane Behavior

16. Mode exclusivity
Does the right pane show either Review Mode or Edit Mode, but never both at once?

17. Review Mode structure
In Review Mode, are document-wide settings shown above the canvas summary?

18. Edit Mode targeting
In Edit Mode, does the pane always show the selected entity’s editable fields only?

19. Selection-to-pane synchronization
When selection changes, does the right pane update to the correct entity immediately?

20. Review summary accuracy
Does the Review Mode summary reflect the true current canvas state after edits?

D. Geometry and Direct Manipulation

21. Geometry in model
Do entities store x, y, width, and height correctly in the model where applicable?

22. Hidden raw geometry
Are raw geometry fields kept out of the normal edit UI when they are meant to be manipulated visually instead?

23. Move behavior
Can movable entities be repositioned reliably through direct manipulation?

24. Resize behavior
Can resizable entities be resized reliably through geometry handles or edges?

25. Automatic geometry update
Do auto-sized entities update width and height automatically when their content changes?

26. Geometry validity after edit
After move, resize, or text change, does geometry remain valid and non-corrupt?

E. Containment and Snapping

27. Parent containment
Do contained entities remain fully inside their owning container?

28. Boundary enforcement
Does the system prevent contained entities from moving outside their allowed bounds?

29. Free placement inside container
Can contained entities move freely inside the allowed region when not snapped?

30. Edge snapping correctness
Do snap-enabled entities snap correctly to the appropriate edges?

31. Snap usability
Is snapping easy to trigger without feeling overly restrictive?

32. Snapped-state rendering
When snapping occurs, is the snapped position rendered clearly and correctly?

F. Text and Auto-Sizing

33. Text edit correctness
Can text-bearing entities be edited correctly through the right pane?

34. Immediate text render
After text editing is finished, does the displayed text update immediately on the canvas?

35. Auto-size correctness
When text changes, do auto-sized entities resize correctly to fit the text?

36. Multiline text handling
If text becomes multiline, does rendering remain readable and geometrically valid?

37. Font-size update behavior
When font-related attributes change, do all affected text renderings update correctly?

G. Connector Logic and Routing

38. Connector classification
Does the system correctly classify connectors as internal or external?

39. Connection rule enforcement
Are valid and invalid connection rules enforced correctly?

40. Endpoint attachment correctness
Do connectors attach only through valid interface midpoint candidates?

41. Midpoint-aware routing
Does routing correctly account for source and target midpoint choices?

42. Multi-segment support
Can connectors be created and maintained as multi-segment paths?

43. Shortest valid route behavior
Does routing choose the shortest valid route under normal conditions?

44. Snapped-edge override
When snapped-edge routing rules apply, do they correctly override generic shortest-path routing?

45. Obstacle handling
Does routing treat entity bodies and labels according to the defined obstacle rules?

46. Rerouting after dependent changes
When connected entities move or change, do connectors reroute correctly?

H. Connector Editable Attributes

47. Direction edit and render
If connector direction is editable, does reversing it update arrowheads and rendered direction immediately?

48. Arrowhead-side edit and render
If arrowhead side is editable, does the arrowhead move to the correct side immediately?

49. Connector content and style edit
If connector text, color, or style attributes are editable, do they update immediately and correctly?

I. Naming and Identity

50. Naming convention integrity
Do automatically generated IDs and derived naming conventions remain correct after create, edit, connect, delete, save, and reload operations?

J. Text Field Focus Retention

51. Typing focus stability
While the user types in a text field, does keyboard focus remain in that same field?

52. No focus steal on rerender
During model updates, validation passes, or canvas rerenders triggered by typing, is focus preserved on the active text field?

53. Explicit click-away behavior
Does focus leave the active text field only when the user explicitly clicks another focus target?

54. Tab navigation behavior
Does pressing `Tab` move focus according to expected tab order without unintended intermediate blur/focus jumps?

55. Enter-as-commit behavior
When `Enter` is configured as a commit action for a field, does pressing `Enter` commit correctly and then move/retain focus according to the defined field behavior?
