# Annotation Attachment Behavior

## What is an annotation

An annotation (comment) is a sticky-note element: a yellow rounded rectangle with a dog-ear fold at the top-right corner. It can exist free-floating on the canvas or be *pinned* to exactly one other element.

---

## Pinning

### When pinning happens

Pinning is evaluated on **mouseup** at the end of every drag. When the user drops an annotation:

1. The border-to-border distance between the annotation and every non-annotation element on the canvas is computed.
2. If the closest element is within **50 screen pixels** (zoom-independent), the annotation pins to it.
3. If no element is within range, any existing pin is cleared and the annotation becomes free-floating.

A pin is therefore set or cleared automatically — there is no manual pin/unpin action.

### Snap radius

The threshold is **50 screen pixels**, not 50 canvas units. At 50 % zoom, 50 screen pixels corresponds to 100 canvas units; at 200 % zoom it corresponds to 25 canvas units. This keeps the "snap feel" consistent regardless of how far the user is zoomed in or out.

### Distance measurement

Distance is measured **border-to-border** between the two bounding rectangles:

This means:
- An annotation that overlaps an element has distance 0 (always within range).
- An annotation flush against an edge has distance 0.
- Corner proximity is measured diagonally.
- Rounded corners/boardes should be taken in consideration

### Target priority when multiple elements are in range

When several elements are within the snap radius, the **closest** one wins. However, container elements (`package`, `uc-system`, `seq-diagram`, `seq-fragment`) are always deprioritized: any leaf element within range beats any container, regardless of which is physically closer. Among elements of the same tier (leaf vs leaf, or container vs container) the closest wins.

---

## Live preview

While an annotation is being dragged, a **dashed pin line** is drawn in real time to show which element would be pinned on drop:

- The line appears as soon as the annotation enters the 50 px snap radius of a candidate element.
- The line disappears as soon as the annotation moves out of range.
- The line always connects the nearest point on the annotation's border to the nearest point on the target element's border (border-to-border, not center-to-center).

---

## Pin line rendering

The dashed line connects the two element borders using shape-aware geometry:

| Element shape | Border calculation |
|---|---|
| Rectangle (default) | Nearest point on axis-aligned rect |
| Pill / stadium (`state`, `storage`, `queue`) | Two semicircular caps + straight band |
| Ellipse (`use-case`) | Scaled direction vector by semi-axes |
| Circle (`start-state`, `end-state`) | Scale direction vector to radius |

The comment border is always treated as a rectangle.

---

## Following a pinned target

When a pinned element is moved (drag, arrow keys, or any other position update), the annotation moves with it, maintaining a **fixed offset** from the target's top-left corner. The offset is recorded at the moment of pinning:

```
pinnedOffset = { x: ann.x − target.x, y: ann.y − target.y }
```

On every subsequent position update of the target:

```
ann.position = { x: target.x + pinnedOffset.x, y: target.y + pinnedOffset.y }
```

The annotation is treated as a rigid attachment — it does not rotate or scale relative to the target, only translates.

Deleting the entity shall delete the connection line (and update render immediatly) but keept the annotation.

---

## Unpinning

An annotation is unpinned by dragging it away from its target until the border-to-border distance exceeds 50 screen pixels, then releasing. On drop, the pin is cleared and the annotation stays at wherever it was released.

---

## Persistence

`pinnedTo` (target element id) and `pinnedOffset` (x/y) are serialized as part of the diagram JSON. On load, the pin line is restored automatically. If the target element no longer exists (e.g. was deleted before save), the pin line is hidden and the annotation remains at its last stored position.

## Misc

Selecting Comments in the toolbar or creating new onces should immediatly enable the view comments option.