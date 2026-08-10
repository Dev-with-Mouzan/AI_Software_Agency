# MECHANICA — Frontend Design Plan

A precision instrument for arithmetic. The UI is styled as a **vintage
scientific instrument**: an enamel-keyed mechanical calculator with an amber
phosphor register and a paper adding-machine tape for history. Nothing about
it looks like a default OS calculator or a generic SaaS panel — it reads as a
serious, crafted tool you'd find on an engineer's bench.

## Concept

The product is a calculator whose backend is a *safe expression engine* (AST
whitelist, no `eval`). The visual world that matches that promise is precision
instrumentation: machined metal, enamel keys, phosphor readouts, ruled paper.
The design language is "brass-and-ivory instrument", and the copy speaks from
the instrument's point of view (ACC register, DISP register, TAPE, LINK lamp,
SAFE ENGINE note).

## Palette (6 named colors)

| Token        | Hex       | Role                                          |
| ------------ | --------- | --------------------------------------------- |
| `ink`        | `#0A0F1E` | Chassis / page ground (deep midnight)         |
| `ink-2`      | `#131A2C` | Raised panel surface                          |
| `paper`      | `#F2ECDD` | Enamel keys + history tape (warm ivory)       |
| `brass`      | `#C9983F` | Accent: wordmark, operators, focus, `=` key   |
| `phosphor`   | `#F6C95B` | Display readout (amber glow, CRT scanlines)   |
| `steel`      | `#7E88A0` | Secondary text, inactive hardware             |
| `vermilion`  | `#D4553B` | Errors, clear key, LINK-down lamp             |

(`ok` green `#5ECF8A` is used only for the LINK lamp state.)

## Typography

- **Display — Fraunces** (Google Fonts): characterful optical serif, used with
  restraint — only the "MECHANICA" wordmark.
- **Body — Inter**: labels, buttons, general UI copy.
- **Utility — IBM Plex Mono**: every number, register readout, timestamp and
  footer note. Mono = instrument = numbers, so it carries the identity.

## Layout

- Single page, two instruments side by side on desktop (stacked on mobile):
  1. **The machine** (main): header (wordmark + LINK lamp), amber display
     module (ACC small register + DISP big register + status line), keypad
     (2-column function bank × 4-column numeric bank), footer with engine note.
  2. **The tape** (history): ivory paper panel with serrated top edge, ruled
     lines, mono entries (time / expression / result), clear button.
- The function bank is rendered **from `GET /api/operations`** at runtime, so
  the keypad always matches the backend whitelist.

## Signature element

**Power-on ceremony + 3D instrument tilt.** On load the machine settles in, the
phosphor register flickers through an 8-segment test (`888888`) and settles on
`0`, the LINK lamp pulses and locks green, and the keypad rows click in
staggered. On pointer devices the whole machine tilts in 3D (≤3°) following the
cursor, with the brass `=` key glowing. History "prints" onto the tape with a
stamped slide-in. All motion is disabled under `prefers-reduced-motion`.

## Interaction details

- Keys are real `<button>`s with `data-action`/`data-value`; full keyboard
  support (digits, `+ - * / % ^ ( )`, Enter, Backspace, Esc).
- `^` maps to `**`, `×`/`÷`/`−` labels map to `*`/`/`/`-` for the API.
- Functions insert `name(`; `=` auto-closes open parens before POSTing.
- Result formatting round-trips: integers print clean, floats trimmed to 12
  significant digits, huge values fall back to exponential — all valid Python
  literals so the result can be reused as the next expression.
- Errors (division by zero, unsafe syntax, API down) flash the status line in
  vermilion with the backend's own `detail` message.

## Accessibility

- Visible brass `:focus-visible` rings on every key; buttons are tabbable.
- `aria-live` on the DISP output and the status line; `aria-label` on every
  icon-only key.
- `prefers-reduced-motion` kills tilt, flicker, stagger and tape animations.
- Responsive: two-column rig collapses to single column under 900px; keys
  shrink under 480px; tape scrolls with a styled scrollbar.

## Run

Serve `frontend/` statically (e.g. `python -m http.server 5500` from
`frontend/`, or VS Code Live Server) with the FastAPI backend on port 8000.
The API base resolves to `http://localhost:8000` automatically (same origin
when served from port 8000) and can be overridden with `window.CALC_API_BASE`.
