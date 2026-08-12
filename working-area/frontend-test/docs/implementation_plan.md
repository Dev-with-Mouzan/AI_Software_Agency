# Implementation Plan — Todo List (Frontend-only)

## 1. Product Summary
A single-page **Todo List** web app built with plain HTML, CSS, and JavaScript (no frameworks, no build step, no backend). Users can add, complete, edit, delete and filter tasks. Tasks persist in the browser via `localStorage`, so they survive page reloads.

### Core features
- Add a new task via input + Enter key or Add button.
- Mark a task as complete (checkbox / strikethrough styling).
- Edit an existing task inline (double-click or edit button).
- Delete a single task.
- Clear all completed tasks at once.
- Filter tasks: All / Active / Completed.
- Live task counter (e.g. "3 items left").
- Persistence: tasks saved to `localStorage` on every change, loaded on startup.
- Empty state message when there are no tasks.

### Out of scope (intentionally)
- Backend / database / user accounts (no server-side persistence).
- Drag-and-drop reordering.
- Due dates, priorities, tags.
- Frameworks, bundlers, transpilers — plain ES6 JavaScript.

## 2. Technology Stack
| Layer | Choice | Why |
|---|---|---|
| Markup | Semantic HTML5 (`<form>`, `<ul>`, `<input>`, `<button>`, ARIA labels) | Accessible, screen-reader friendly |
| Styling | Plain CSS3 (custom properties, flexbox, responsive) | Zero dependencies, easy to theme |
| Logic | Vanilla ES6+ JavaScript (DOM APIs, `localStorage`, event delegation) | No build step; matches request "html css and java(script)" |
| Persistence | `localStorage` (key: `todos`) | Built into the browser, sync, sufficient for a client-only app |
| Testing | Manual checklist + optional `node --check` syntax validation; no test framework needed | App has no external dependencies |

## 3. Architecture
**Type:** Single-page static frontend (SPA-style, but no router — one view).

**Flow:**
```
User action (form submit, click, keypress)
        │
        ▼
app.js event listeners (event delegation on <ul>)
        │
        ▼
State update: todos array (add/toggle/edit/delete/clear/filter)
        │
        ▼
saveTodos() → localStorage.setItem("todos", JSON.stringify(todos))
        │
        ▼
render() → rebuild <ul> + counter + filter states (full re-render of list)
```

- **State model:** single source of truth is a JavaScript array of objects:
  `{ id: string, text: string, completed: boolean }`. The DOM is re-rendered from this array — the DOM never holds state.
- **Event delegation:** one listener on the `<ul>` handles clicks on checkbox/edit/delete buttons via `data-action` / `data-id` attributes (fewer listeners, robust to re-render).
- **Rendering safety:** task text is inserted with `textContent` (or a dedicated escape function) to prevent XSS — never `innerHTML` with user input.
- **Persistence:** load on init inside `try/catch` (corrupt JSON → fall back to empty list); save after every mutation.
- **IDs:** `crypto.randomUUID()` with a fallback to `Date.now()` + random suffix for older browsers.

## 4. API / Data Contract
No HTTP API. Internal localStorage schema:
```json
{
  "todos": [
    { "id": "550e8400-...", "text": "Buy groceries", "completed": false }
  ]
}
```
Migration/validation on load: items without valid shape are dropped.

## 5. File Structure
```
frontend_test/
├── docs/
│   ├── architecture.json
│   └── implementation_plan.md
└── frontend/
    ├── index.html      # markup: header, form, filter bar, list, footer
    ├── css/
    │   └── style.css   # all styles (layout, components, states)
    └── js/
        └── app.js      # state, persistence, rendering, events
```

## 6. Milestones

### Milestone 1 — Skeleton & styling
- `frontend/index.html` with semantic structure (form, input, filter buttons, `<ul id="todo-list">`, footer counter).
- `frontend/css/style.css`: layout, form, list items, checkbox, completed state, filters, empty state, responsive mobile view.
- Result: static UI renders correctly.

### Milestone 2 — Core logic (CRUD)
- `frontend/js/app.js`:
  - State array + load/save (`localStorage`).
  - Add (form submit, Enter key), toggle complete, delete, clear-completed.
  - Render function + counter + empty state.
- Result: fully working todo list without persistence loss on refresh.

### Milestone 3 — Edit, filters & polish
- Inline edit (double-click on text or edit button → input swaps in, Enter/blur saves, Escape cancels).
- Filters: All / Active / Completed + active filter button styling.
- Keyboard + ARIA polish (labels, `aria-pressed` on filters, focus management after delete).
- Result: complete feature set.

### Milestone 4 — Validation & docs
- `node --check js/app.js` syntax check; manual test checklist pass; README update.

## 7. Step-by-Step Tasks
1. Create `frontend/index.html` with semantic markup: header, add-task form, filter bar (All/Active/Completed), unordered list, footer with counter and clear-completed button, and an empty-state element.
2. Create `frontend/css/style.css`: custom properties for colors, flexbox card layout centered on page, styled inputs/buttons, `.completed` strikethrough state, active filter highlight, responsive breakpoint for mobile.
3. Create `frontend/js/app.js`:
   - `loadTodos()` / `saveTodos()` helpers with try/catch and shape validation.
   - `addTodo()`, `toggleTodo(id)`, `deleteTodo(id)`, `editTodo(id, text)`, `clearCompleted()`, `setFilter(filter)`.
   - `render()` re-renders list, counter, filter buttons, empty state.
   - Event listeners: form submit, delegated clicks on the list, filter buttons, input for Enter key.
   - Initialize on `DOMContentLoaded`.
4. Wire up inline editing with a temporary `<input>` replacement, saving on blur/Enter, cancelling on Escape.
5. Run `node --check frontend/js/app.js` and perform the manual test checklist (add, toggle, edit, delete, filters, reload persistence, empty state, mobile width).
6. Update `docs/README.md` with how to open/run the app (`open frontend/index.html` or any static server).
7. Record decisions in memory.

## 8. Testing Strategy
- **Syntax validation:** `node --check frontend/js/app.js` (run via `run_command`).
- **Manual acceptance checklist** (browser):
  - Add task (button + Enter) → appears in list, counter updates.
  - Toggle checkbox → strikethrough + counter updates; filter Active/Completed hides/shows correctly.
  - Edit task → text updates and persists.
  - Delete task → removed; Clear completed removes only completed ones.
  - Refresh page → tasks still present (localStorage).
  - Empty state shows when no tasks.
  - Mobile width (375px) → layout usable.
  - No console errors.

## 9. Deployment Strategy
Static hosting — the app is three static files with no build step. Deploy by uploading `frontend/` to any static host (GitHub Pages, Netlify, Vercel) or opening `index.html` directly. No environment configuration or secrets required.

## 10. Dependencies
None at runtime. Dev-time only: Node.js (any recent version) used solely for `node --check` syntax validation.