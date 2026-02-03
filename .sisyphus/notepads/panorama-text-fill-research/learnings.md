# Source 2 Panorama CSS Text Fill Research

## Research Date: 2026-02-03

---

## 1. Does Panorama CSS support `background-clip: text`?

**ANSWER: NO**

Panorama CSS does NOT support `background-clip: text` or any variant of this property.

Evidence:
- The complete list of CSS properties from `dump_panorama_css_properties` (Dota 2/CS2) does not include `background-clip`
- The libpanorama_strings.txt from SteamDatabase shows no mention of background-clip
- Real-world Panorama CSS files in Dota 2/CS2 mods do not use this property

Standard web CSS for gradient text requires:
```css
background: linear-gradient(...);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

This pattern is NOT available in Panorama.

---

## 2. Are there alternative properties like `-webkit-text-fill-color` or `text-fill-color`?

**ANSWER: NO**

Panorama CSS does NOT support:
- `-webkit-text-fill-color`
- `text-fill-color`
- Any webkit-prefixed text color properties

The only text color property available is:
- `color` - Sets the foreground fill color/gradient for text

From dump_panorama_css_properties:
```
=== color ===
Sets the foreground fill color/gradient/combination for a panel. This color is the color used to render text within the panel.
```

---

## 3. Can gradients be applied to text in Panorama?

**ANSWER: PARTIALLY**

The `color` property in Panorama DOES support gradients:
```css
color: gradient( linear, 0% 0%, 0% 100%, from( #cbcbcbff ), to( #a0a0a0a0 ) );
```

HOWEVER, this applies the gradient to the ENTIRE text uniformly. It does NOT allow:
- Partial text fills (e.g., 50% grey, 50% white)
- Clipped gradient application
- Per-character gradients

The gradient applies to the whole text content as a single unit.

---

## 4. What text styling properties ARE available in Panorama CSS?

Based on dump_panorama_css_properties and libpanorama_strings.txt:

### Text Color & Effects
- `color` - Text color (supports solid colors AND gradients)
- `text-shadow` - Text shadows with blur and strength

### Text Layout
- `text-align` - left, right, center
- `text-overflow` - clip, ellipsis, shrink, noclip
- `white-space` - normal, nowrap
- `line-height` - Line spacing
- `letter-spacing` - Character spacing

### Text Decoration
- `text-decoration` - none, underline, line-through
- `text-transform` - none, uppercase, lowercase

### Font Properties
- `font-family` - Font face
- `font-size` - Size in pixels
- `font-style` - normal, italic
- `font-weight` - light, thin, normal, medium, bold, black

### NOT Available (Web CSS features missing in Panorama)
- `background-clip: text`
- `-webkit-text-fill-color`
- `text-fill-color`
- `clip-path` (only `clip: rect()` is available)
- `mask-image` / `mask` (only `opacity-mask` for panels)

---

## 5. Current Dual-Label Approach Analysis

The current implementation in buff_timer_virgin uses:

```css
/* Base Label (Background/Inactive) */
#BuffTime {
    color: #808080;  /* Grey */
    z-index: 1;
}

/* Clip Label (Foreground/Active) */
#BuffTimeClip {
    color: #ffffff;  /* White */
    z-index: 2;
    clip: rect(0%, 100%, 100%, 0%);  /* Dynamic clip */
}
```

This works by:
1. Two labels with identical text positioned absolutely on top of each other
2. Bottom label shows grey text
3. Top label shows white text with `clip: rect()` to show only a portion
4. JavaScript updates both `.text` properties and the clip rect

### Why This Is Necessary

Panorama's `clip` property works on PANELS, not text directly. The `clip: rect()` CSS property clips the entire panel content, which includes the text.

There is no way to clip or mask just the text fill within a single label while keeping the text content unified.

---

## 6. Alternative Approaches Considered

### Option A: Single Label with Gradient Color
```css
#BuffTime {
    color: gradient( linear, 0% 0%, 100% 0%, from(#808080), to(#ffffff) );
}
```
**Result**: Gradient across entire text, not a hard clip at a specific percentage.

### Option B: Overlay Panel with Background Color
Used in v6.0 overlay panel system:
```css
#BuffOverlay {
    background-color: #ffffff;
    clip: rect(0%, 50%, 100%, 0%);
}
```
**Result**: This clips a colored panel, not text. Different visual effect.

### Option C: text-decoration or text-shadow hacks
**Result**: Neither property supports partial coloring or clipping.

---

## 7. Conclusion

**There is NO single-label solution for a text fill effect with a hard clip boundary in Panorama CSS.**

The dual-label approach is REQUIRED because:
1. Panorama lacks `background-clip: text`
2. Panorama lacks text masking/clipping properties
3. The `clip` property only works at the panel level
4. Gradients apply uniformly to entire text

To avoid text sync issues, ensure both labels receive the same text content simultaneously in JavaScript.

---

## Sources

1. Dota 2 dump_panorama_css_properties: https://github.com/XavierCHN/Dota-Reborn-Package/blob/master/dota-js/dump_panorama_css_properties
2. SteamDatabase libpanorama_strings.txt: https://github.com/SteamDatabase/GameTracking-Dota2/blob/master/game/bin/linuxsteamrt64/libpanorama_strings.txt
3. Strata Source Wiki: https://wiki.stratasource.org/panorama/overview/getting-started
4. Real-world examples from bmddota/barebones, AveYo/ShowMMR, XavierCHN/x-template
