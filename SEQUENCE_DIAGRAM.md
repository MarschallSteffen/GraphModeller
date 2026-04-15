# Sequence Diagram — Design Rules

## Timeline & Arrow Positioning

- All lifelines share a single global timeline baseline Y (bottom of the tallest header box).
- Each message slot is spaced **40px apart**: slot Y0 = 40 (below header box), slot 1 → Y0+40, slot 2 → Y0+80, ...
- Slot index = message row index on the source lifeline.
- All arrows at the same slot index are drawn at the same absolute screen Y → always perfectly horizontal.

## Active Zones (Activation Bars)

- A bar opens on a lifeline when it **sends** a connected message (sync/async/create) — starts at the slot Y of that message.
- A bar also opens on the **receiving** lifeline at the same slot Y when it receives a connected message.
- Bars extend **40px below** the last slot Y that touched the lifeline (either sent or received).
- A **return** message closes the sender's active bar 40px below its slot Y.
- Bars are merged if they overlap or are adjacent (≤2px gap).
- Only the bottom-most bar on each lifeline shows the drag port.

## Arrow Endpoints

- Forward arrows (sync/async/create) exit the **right edge** of the source bar (or spine if inactive), arrive at the **left edge** of the target bar (or spine if inactive).
- Return arrows exit the **left edge** of the source bar, arrive at the **right edge** of the target bar.
- Bar half-width offset = 6px.

## Message Types

| Kind    | Line style     | Arrowhead     | Direction      |
|---------|---------------|---------------|----------------|
| sync    | solid          | filled (▶)    | forward        |
| async   | dashed (4 3)   | open (>)      | forward        |
| create  | dashed (4 3)   | open (>)      | forward        |
| return  | dashed (4 3)   | open (>)      | backward       |
| self    | stepped loop   | open (>)      | same lifeline  |

## Connecting Messages

- Dragging from a connection slot at the base of the active bar (or Y0 for lifelines without any active section yet) will create a new connection
- conenction points everywhere halfway between existing messages (to allow inserting new messages. on space up to use the original 40px spacing everywhere)
- Hover detection uses diagram-space bounding box math (not DOM hit testing) to avoid Z-order issues.
- The drop target lifeline is tracked during mousemove (`lastHoveredId`) and committed on mouseup — no `elementFromPoint` on mouseup.

## Snapping

- Lifelines snap to each other using **header box size only** (40×140px), not their full expanded height.
- Gap snapping and center-alignment use the header rect so lifelines align by header top regardless of how many messages they contain.

## Interactions

- **Click inter-lifeline arrow** → same popover, pre-filled with current kind/target.
- **Drag message row** to another lifeline → connects the message (sets `targetLifelineId`).
- **Drag from bar port** (circle at bar bottom) → creates a new sync message to the dropped lifeline.
- **Double-click message label** → inline text edit.
- **Remove message** button in popover deletes the message row.

## Data Model

- Messages are stored inline inside each `SequenceLifeline` entity (`messages: SequenceMessage[]`).
- No `Connection` entities are used — inter-lifeline arrows are rendered in a dedicated `seqConnLayer` overlay.
- `targetLifelineId: null` means unconnected stub; `kind: 'self'` means loopback.
