# Design Plan — Daily Ledger (Todo List)

A single-page todo list, plain HTML/CSS/JS, no build step. The visual identity is a
**hand-annotated paper ledger**: a task list treated like a sheet you strike through
with a red pen.

(Note: `docs/design.md` was requested but `docs/` is outside the frontend write scope,
so this plan lives at `frontend/design.md`.)

## Palette (5 named colors)
| Token | Value | Role |
|---|---|---|
| `--ink` | `#222a3c` | Deep blue-black ink — text, primary button, checkbox outline |
| `--paper` / `--paper-bright` | `#f6f1e6` / `#fbf8ef` | Warm cream paper — card surface |
| `--hairline` | `#e4dcc7` | Ruled-line separators, borders |
| `--pen` | `#c2472e` | Oxide red — the completing "pen", accents, focus |
| `--muted` | `#8f8873` | Faded pencil grey — secondary text, icons |
| Backdrop | `#191f2d` | Deep ink-navy page so the paper sheet floats and glows |

## Type pairing
- **Display:** Fraunces (600) — characterful serif, used only for the headline and the
  empty-state line. Restrained.
- **Body:** Inter (400/500/600) — clean UI face for inputs, task text, buttons.
- **Utility:** IBM Plex Mono (400/500) — uppercase micro-labels: eyebrow, filters,
  counter, ghost button. Gives the "printed form" feel.

Google Fonts with robust system fallbacks (offline degrades gracefully; no build step).

## Layout
Single centered 620px paper card on a deep navy backdrop. Vertical rhythm:
eyebrow → headline → ruled input + Add stamp → filter tab row → ledger list →
footer (counter + clear). A vertical **red margin line** runs down the left of the
list area (like a notebook margin); each task's checkbox hangs on that line and text
sits indented past it.

## Signature element
**The red-pen completion.** When you complete a task, the checkbox's checkmark draws
itself (SVG stroke animation) and a slightly skewed red strike line is drawn across the
text, left to right, like underlining with a pen. That single choreographed moment
repeats per task — everything else stays quiet.

## Motion
- Page load: card settles down with a subtle `rotateX` (sheet being set down), then
  header/form/filters/list/footer rise in staggered.
- New tasks enter with a short fade-slide; deleting tasks slides the row out before
  removal.
- Micro-interactions: buttons lift 1px on hover and press down on click; active filter
  gets an animated pen underline; checkbox border warms to pen-red on hover.
- `prefers-reduced-motion` disables all animation; visible `:focus-visible` outlines in
  pen-red throughout; `touch-action: manipulation` on all buttons.

## Accessibility
- Real `<form>` submit (Enter works), semantic `<ul>`/`<li>`, labels via `.sr-only`.
- State conveyed to AT: `aria-pressed` on filter buttons and per-task check buttons,
  `aria-live` counter ("N items left"), labelled icon buttons, `disabled` clear button.
- Task text inserted with `textContent` only (no `innerHTML` with user input).
