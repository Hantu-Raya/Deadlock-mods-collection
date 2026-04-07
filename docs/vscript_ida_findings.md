# vscript.dll IDA findings

## Scope
Focus: `G:\SteamLibrary\steamapps\common\Deadlock\game\bin\win64\vscript.dll`

## What I found

### Logging channels
- `sub_18005CE30` registers the `VScript` logging channel.
- `sub_18005CE70` registers the `VScriptDbg` logging channel.

These are logging setup helpers, not debugger transport.

### Panorama debugger plumbing
- `sub_18004A1B0` registers `panorama_toggledebugger_mode`.
- `sub_18004C720` registers `ToggleDebugger`.
- `sub_1800CC370` builds a command/event payload from the active symbol table entry.
- `sub_1800B6BB0` forwards into `sub_1800CA150`.
- `sub_1800CC3A0` allocates a `panorama::IUIEvent` / `CUIEvent` wrapper.
- `sub_1800CA150` is a string formatter helper used by the command path.
- `sub_18012B090` handles the `ToggleDebugger` hotkey path and dispatches the matching Panorama debugger action.
- `sub_18012C9E0` parses event/button metadata and installs the `PanoramaDebuggerHotkey` handler.

### Key conclusion
`vscript.dll` is mostly Panorama debugger UI wiring. The `ToggleDebugger` path creates hotkey/event plumbing and not the actual VScript debug transport.

## Switch point
At this point, `vscript.dll` is mapped enough for the current question. If the goal is the real script-debug bridge or console transport, the next place to inspect is `vconcomm.dll`, or return to `engine2.dll` around `VScriptManager010` for bootstrap-side integration.
