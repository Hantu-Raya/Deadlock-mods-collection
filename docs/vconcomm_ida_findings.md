# vconcomm.dll IDA findings

## Scope
Focus: `G:\SteamLibrary\steamapps\common\Deadlock\game\bin\win64\vconcomm.dll`

## What I found

### Transport / startup
- `sub_180005490` is the main `CVConComm::Init` path.
- It reads command-line settings for the listen port and connection count.
- It resolves the module base name and computes a CRC over it.
- It initializes the server-side TCP socket.
- It fails loudly if socket services, listening, or endpoint discovery fail.

### VConsole wait loop
- `sub_180005D30` waits for a VConsole client to connect.
- It logs:
  - `Waiting For VConsole To Connect...`
  - `Connection will timeout in %d seconds...`
  - `No VConsole, Ignoring.`

### Message routing
- `sub_180007500` dispatches incoming VConsole messages to the registered handler.
- It validates message version / ownership and logs mismatches or unclaimed messages.
- If no handler claims a message, it logs:
  - `VConsole Rejecting Message: '%s', No Message Handler Claimed Ownership.`

### Window detection
- `EnumFunc` walks visible windows and looks for the `VConsole2` title/class pattern.
- This is used to find an existing VConsole window and bring it forward.

## Key conclusion
`vconcomm.dll` is the actual VConsole communication layer. Unlike `vscript.dll`, this one is transport and dispatch, not debugger UI glue.

## Switch point
If the goal is console transport behavior, this module is now mapped enough. If the goal is to chase who consumes the transport, the next layer is the caller side in `engine2.dll` or the specific listener/handler registrations inside this module.
