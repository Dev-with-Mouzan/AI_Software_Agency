"use strict";

/* ============================================================
   Daily Ledger — state, persistence, rendering, events
   Single source of truth: state.todos array of
   { id, text, completed }. DOM is fully re-rendered from state.
   ============================================================ */

const STORAGE_KEY = "todos";

const state = {
  todos: [],
  filter: "all", // "all" | "active" | "completed"
  editingId: null,
  justCompleted: new Set()
};

/* ---------- DOM refs ---------- */

const form = document.getElementById("add-form");
const input = document.getElementById("new-task");
const listEl = document.getElementById("todo-list");
const emptyState = document.getElementById("empty-state");
const counterEl = document.getElementById("counter");
const clearBtn = document.getElementById("clear-completed");
const filterBtns = Array.from(document.querySelectorAll(".filter"));

/* ---------- ids ---------- */

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}

/* ---------- persistence ---------- */

function isValidTodo(t) {
  return (
    t !== null &&
    typeof t === "object" &&
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.text === "string" &&
    t.text.trim().length > 0 &&
    typeof t.completed === "boolean"
  );
}

function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isValidTodo)
      .map((t) => ({ id: t.id, text: t.text.trim(), completed: t.completed }));
  } catch {
    return []; // corrupt JSON / storage unavailable → start empty
  }
}

function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
  } catch {
    // storage unavailable (private mode / quota) — app still works in memory
  }
}

/* ---------- mutations ---------- */

function addTodo(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  state.todos.push({ id: uid(), text: trimmed, completed: false });
  saveTodos();
  render();
}

function toggleTodo(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.completed = !todo.completed;
  if (todo.completed) state.justCompleted.add(id);
  saveTodos();
  render();
  setTimeout(() => state.justCompleted.delete(id), 800);
}

function editTodo(id, text) {
  const todo = state.todos.find((t) => t.id === id);
  const trimmed = text.trim();
  if (!todo || !trimmed) return;
  todo.text = trimmed;
  saveTodos();
  render();
}

function deleteTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  saveTodos();
  render();
}

function clearCompleted() {
  state.todos = state.todos.filter((t) => !t.completed);
  saveTodos();
  render();
}

function setFilter(filter) {
  state.filter = filter;
  render();
}

function visibleTodos() {
  switch (state.filter) {
    case "active":
      return state.todos.filter((t) => !t.completed);
    case "completed":
      return state.todos.filter((t) => t.completed);
    default:
      return state.todos;
  }
}

/* ---------- rendering ---------- */

let prevIds = new Set();

function findItem(id) {
  return Array.from(listEl.children).find((li) => li.dataset.id === id);
}

function createItem(todo, index) {
  const li = document.createElement("li");
  li.className = "task";
  li.dataset.id = todo.id;
  if (todo.completed) li.classList.add("completed");
  if (state.justCompleted.has(todo.id)) li.classList.add("just-completed");
  if (!prevIds.has(todo.id)) {
    li.classList.add("new");
    li.style.animationDelay = Math.min(index * 45, 360) + "ms";
  }

  const check = document.createElement("button");
  check.type = "button";
  check.className = "check";
  check.dataset.action = "toggle";
  check.dataset.id = todo.id;
  check.setAttribute("aria-pressed", String(todo.completed));
  check.setAttribute(
    "aria-label",
    todo.completed
      ? `Mark "${todo.text}" as active`
      : `Mark "${todo.text}" as completed`
  );
  check.innerHTML =
    '<svg class="check-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M5 12.5l4.2 4.2L19 7.5"/></svg>';

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = todo.text; // safe: never innerHTML with user input
  text.title = "Double-click to edit";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn edit";
  editBtn.dataset.action = "edit";
  editBtn.dataset.id = todo.id;
  editBtn.setAttribute("aria-label", `Edit "${todo.text}"`);
  editBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M5 19l.9-3.6L16.5 4.8a1.7 1.7 0 0 1 2.4 2.4L8.3 17.7 5 19z"/>' +
    '<path d="M14.6 6.8l2.6 2.6"/></svg>';

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "icon-btn del";
  delBtn.dataset.action = "delete";
  delBtn.dataset.id = todo.id;
  delBtn.setAttribute("aria-label", `Delete "${todo.text}"`);
  delBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M6 6l12 12M18 6L6 18"/></svg>';

  li.append(check, text, editBtn, delBtn);
  return li;
}

function render() {
  const todos = visibleTodos();

  listEl.textContent = "";
  const fragment = document.createDocumentFragment();
  todos.forEach((todo, index) => fragment.appendChild(createItem(todo, index)));
  listEl.appendChild(fragment);

  const activeCount = state.todos.filter((t) => !t.completed).length;
  counterEl.textContent = `${activeCount} ${activeCount === 1 ? "item" : "items"} left`;

  clearBtn.disabled = state.todos.length - activeCount === 0;

  filterBtns.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.filter === state.filter));
  });

  if (todos.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent =
      state.todos.length === 0
        ? "Nothing here yet — add your first task above."
        : state.filter === "active"
          ? "No active tasks — you're all caught up."
          : "No completed tasks yet.";
  } else {
    emptyState.hidden = true;
  }

  prevIds = new Set(todos.map((t) => t.id));
}

/* ---------- inline editing ---------- */

function startEdit(id) {
  if (state.editingId) return; // one editor at a time
  const li = findItem(id);
  const textEl = li && li.querySelector(".task-text");
  const todo = state.todos.find((t) => t.id === id);
  if (!li || !textEl || !todo) return;

  state.editingId = id;

  const editInput = document.createElement("input");
  editInput.type = "text";
  editInput.className = "edit-input";
  editInput.value = todo.text;
  editInput.setAttribute("aria-label", "Edit task");
  editInput.maxLength = 300;

  textEl.replaceWith(editInput);
  editInput.focus();
  editInput.select();

  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    state.editingId = null;
    const value = editInput.value.trim();
    if (value) editTodo(id, value);
    else render(); // empty edit → keep the original task
  };

  editInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      done = true;
      state.editingId = null;
      render();
    }
  });
  editInput.addEventListener("blur", () => {
    if (!editInput.isConnected) return; // already re-rendered
    commit();
  });
}

/* ---------- delete with exit animation ---------- */

function handleDelete(id) {
  const li = findItem(id);
  if (li) {
    li.classList.add("removing");
    setTimeout(() => deleteTodo(id), 180);
  } else {
    deleteTodo(id);
  }
}

/* ---------- events ---------- */

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  addTodo(value);
  input.value = "";
  input.focus();
});

listEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !listEl.contains(btn)) return;
  const { action, id } = btn.dataset;
  if (action === "toggle") toggleTodo(id);
  else if (action === "edit") startEdit(id);
  else if (action === "delete") handleDelete(id);
});

listEl.addEventListener("dblclick", (e) => {
  const text = e.target.closest(".task-text");
  if (!text) return;
  const li = text.closest(".task");
  if (li) startEdit(li.dataset.id);
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => setFilter(btn.dataset.filter));
});

clearBtn.addEventListener("click", clearCompleted);

/* ---------- init ---------- */

state.todos = loadTodos();
render();
