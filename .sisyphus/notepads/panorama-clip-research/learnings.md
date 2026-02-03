# Source 2 Panorama CSS Clip Research - Findings

## Overview
This document summarizes findings on implementing progress bars with clip-based fills in Source 2 Panorama UI.

---

## 1. How clip: rect() Works in Source 2 Panorama

### Syntax
```css
clip: rect(top, right, bottom, left);
```

**CRITICAL**: In Source 2 Panorama, `clip` uses **percentages** for dynamic sizing:
```css
clip: rect(0%, 50%, 100%, 0%);  /* Shows left half of element */
clip: rect(0%, 100%, 100%, 50%); /* Shows right half of element */
```

### Key Behavior
- `clip` only works on elements with `position: absolute` or `position: fixed` (or `position` property set)
- In Panorama, Panels with `position: 0px 0px 0px` can use clip
- The clipped element is **still in the render tree** - it just has a restricted visible region
- Clipping does NOT affect z-index or stacking context

---

## 2. Panel vs Label with clip

### Panel (Recommended for Progress Fills)
```xml
<Panel id="BuffOverlay" class="timer-overlay" hittest="false" />
```
```css
.timer-overlay {
    position: 0px 0px 0px;
    width: 100%;
    height: 100%;
    z-index: 1;
    clip: rect(0%, 0%, 100%, 0%);  /* Initially hidden */
}

#BuffOverlay {
    background-color: #ffffff;  /* Use background-color for fill */
}
```

**Why Panel works better:**
1. Panels render background-color behind text content
2. No text synchronization needed between layers
3. Lower CPU impact (no text layout calculations)
4. z-index layering works predictably

### Label (Problematic)
```xml
<Label id="BuffTime" text="0:00" />
```
- Labels with `clip` will clip their own text
- Cannot easily achieve "text on top of colored fill" effect
- Text color changes affect the entire label

---

## 3. The "Overlay Covering Text" Problem - ROOT CAUSE

### The Issue
When you have:
```xml
<Panel class="timer-wrapper">
    <Panel id="BuffOverlay" class="timer-overlay" />  <!-- z-index: 1 -->
    <Label id="BuffTime" text="0:00" />               <!-- z-index: 2 -->
</Panel>
```

With CSS:
```css
.timer-overlay {
    background-color: #ffffff;
    z-index: 1;
}

#BuffTime {
    z-index: 2;
}
```

**The overlay STILL covers the text!** Why?

### Root Cause: DOM Order vs z-index in Panorama
In Source 2 Panorama:
1. **DOM order matters more than z-index** for same-level siblings
2. Later elements in DOM render on top of earlier elements by default
3. z-index only works reliably within the same stacking context when combined with `position`

### The Fix: Use `flow-children: none` + Absolute Positioning
```css
.timer-wrapper {
    flow-children: none;  /* Critical: removes automatic layout flow */
    width: 100%;
    height: 70%;
}

.timer-overlay {
    position: 0px 0px 0px;  /* Required for clip to work */
    width: 100%;
    height: 100%;
    z-index: 1;
}

#BuffTime {
    position: 0px 0px 0px;  /* Also needs position for z-index to work */
    width: 100%;
    height: 100%;
    z-index: 2;
}
```

### Alternative Fix: Reverse DOM Order
```xml
<Panel class="timer-wrapper">
    <Label id="BuffTime" text="0:00" />               <!-- Rendered first (behind) -->
    <Panel id="BuffOverlay" class="timer-overlay" />  <!-- Rendered second (on top) -->
</Panel>
```
With `flow-children: none`, the overlay will cover the label unless you use z-index properly.

---

## 4. Working Implementation Pattern (From Project Code)

### XML Structure
```xml
<Panel id="Buff" hittest="false">
    <Panel id="BuffTimeWrapper" class="timer-wrapper">
        <Panel id="BuffOverlay" class="timer-overlay" hittest="false" />
        <Label id="BuffTime" text="0:00" />
    </Panel>
    <Image id="BuffImg" src="..." />
</Panel>
```

### CSS
```css
.timer-wrapper {
    flow-children: none;
    width: 100%;
    height: 70%;
    margin-bottom: 5%;
    horizontal-align: center;
    vertical-align: center;
}

.timer-overlay {
    position: 0px 0px 0px;
    width: 100%;
    height: 100%;
    z-index: 1;
    clip: rect(0%, 0%, 100%, 0%);  /* Start fully clipped */
}

/* Buff fills from RIGHT to LEFT */
#BuffOverlay {
    background-color: #ffffff;
    clip: rect(0%, 100%, 100%, 100%);  /* Start: show nothing (clip everything) */
}

/* Rejuv fills from LEFT to RIGHT */
#RejuvOverlay {
    background-color: #ffffff;
    clip: rect(0%, 0%, 100%, 0%);  /* Start: show nothing */
}

#BuffTime, #RejuvTime {
    font-size: 24px;
    color: #808080;  /* Grey text - visible over white overlay */
    horizontal-align: center;
    vertical-align: center;
    width: 100%;
    height: 100%;
    z-index: 2;
    text-align: center;
}
```

### JavaScript (Updating the Clip)
```javascript
// For right-to-left fill (Buff)
const pct = (remainingTime / totalTime) * 100;
overlay.style.clip = `rect(0%, 100%, 100%, ${pct}%)`;

// For left-to-right fill (Rejuv)  
const pct = (remainingTime / totalTime) * 100;
overlay.style.clip = `rect(0%, ${pct}%, 100%, 0%)`;
```

---

## 5. Best Practices for Progress Bars in Source 2

### DO:
1. ✅ Use `Panel` for the colored fill overlay (not Label)
2. ✅ Set `flow-children: none` on the wrapper
3. ✅ Use `position: 0px 0px 0px` on clipped elements
4. ✅ Use `background-color` on the overlay Panel
5. ✅ Use percentages in `clip: rect()` for responsive sizing
6. ✅ Set explicit `z-index` values (1 for overlay, 2+ for text)
7. ✅ Use `hittest="false"` on overlay panels

### DON'T:
1. ❌ Use `clip-path` - not supported in Panorama
2. ❌ Use `clip: rect()` with pixel values (use percentages)
3. ❌ Write `.text` on overlay Panels (they have no text property)
4. ❌ Forget `position` property - clip won't work without it
5. ❌ Use `box-shadow` for glows - Panorama ignores it
6. ❌ Use `transform: scale3d` on text - causes artifacts

---

## 6. Common Patterns

### Right-to-Left Fill (Countdown style)
```css
/* Start: full width visible */
clip: rect(0%, 100%, 100%, 0%);

/* 50% progress: right half visible */
clip: rect(0%, 100%, 100%, 50%);

/* End: nothing visible */
clip: rect(0%, 100%, 100%, 100%);
```

### Left-to-Right Fill (Progress style)
```css
/* Start: nothing visible */
clip: rect(0%, 0%, 100%, 0%);

/* 50% progress: left half visible */
clip: rect(0%, 50%, 100%, 0%);

/* End: full width visible */
clip: rect(0%, 100%, 100%, 0%);
```

---

## 7. Reference: Project Implementation

**File**: `buff_timer_virgin/panorama/styles/hud_timer.css`
**Lines**: 173-194

```css
.timer-overlay {
    position: 0px 0px 0px;
    width: 100%;
    height: 100%;
    z-index: 1;
    clip: rect(0%, 0%, 100%, 0%);
}

/* Buff Overlay - fills from right to left */
#BuffOverlay {
    background-color: #ffffff;
    clip: rect(0%, 100%, 100%, 100%);
}

/* Rejuv Overlay - fills from left to right */
#RejuvOverlay {
    background-color: #ffffff;
    clip: rect(0%, 0%, 100%, 0%);
}
```

**File**: `buff_timer_virgin/panorama/layout/hud.xml`
**Lines**: 193-207

```xml
<Panel id="Buff" class="BuffP" hittest="false">
    <Panel id="BuffTimeWrapper" class="timer-wrapper">
        <Panel id="BuffOverlay" class="timer-overlay" hittest="false" />
        <Label id="BuffTime" text="0:00" />
    </Panel>
    <Image id="BuffImg" src="..." />
</Panel>
```

---

## 8. Summary

The key insight is that **Source 2 Panorama uses a custom CSS implementation** where:

1. `clip: rect()` works with percentages (not just pixels)
2. DOM order matters for stacking - use `flow-children: none` to control layering
3. Panels are better than Labels for overlay fills because they render background-color predictably
4. Both elements need `position` set for z-index to work properly

The working pattern is:
- Wrapper: `flow-children: none`
- Overlay Panel: `position: 0px 0px 0px`, `z-index: 1`, `clip: rect(...)`
- Text Label: `z-index: 2` (higher than overlay)
