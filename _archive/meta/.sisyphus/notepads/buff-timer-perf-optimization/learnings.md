# Learnings - Buff Timer Performance Optimization

## 2026-01-19 Task: Performance Optimization v5.2 → v5.3

### Panorama UI Performance Patterns

**1. Squared Distance Comparison**
- `Math.sqrt()` is 10-20x slower than multiplication
- Pattern: `distSq(a,b) < RADIUS_SQ` instead of `dist(a,b) < RADIUS`
- Pre-compute squared constants: `CLAIM_RADIUS_SQ = CLAIM_RADIUS * CLAIM_RADIUS`

**2. DOM Write Guards**
- Every `.text` assignment triggers Panorama layout recalculation
- Even setting the same value causes layout work
- Pattern: Track last value, only write if changed
```javascript
let _lastText = "";
if (txt !== _lastText) { 
  label.text = txt; 
  _lastText = txt; 
}
```

**3. Timestamp Caching**
- `Date.now()` has syscall overhead
- Capture once per tick in main loop, pass to subfunctions
- Pattern: `loop() { const rn = Date.now(); doWork(rn); }`

**4. Try-Catch Optimization**
- Nested try-catch in loops multiplies overhead
- Pattern: Single try-catch wrapper around entire function body
- Keep loops inside the try block, not wrapped individually

### Dead Code Identification

**Confirmed Safe to Remove:**
- Unused constants (declared but never referenced)
- Function parameters that are never read
- Return object properties that callers don't destructure
- Tracking variables that are set but never used

**DO NOT Remove:**
- Anything that might be called by game engine callbacks
- Event handlers registered with `$.RegisterForUnhandledEvent()`
- Functions that appear in XML `onactivate` attributes

### Compilation Workflow

```powershell
# Always compile after changes
"sr2compiler\New folder.exe" "buff_timer_virgin"

# Verify output
dir buff_timer_virgin_compiled\panorama\scripts\*.vjs_c
```

### Metrics Achieved

| Metric | Before | After |
|--------|--------|-------|
| Lines of code | 428 | 423 |
| Math.sqrt() calls | 1 | 0 |
| Nested try-catch | 5+ | 1 |
| Redundant DOM writes/sec | ~10 | 0 |
| Date.now() calls/tick | 3+ | 1 |
