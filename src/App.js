// App.js
// -------------------------------------------------------------
// Kanban Board with:
// - 4 columns (To Do / Doing / Review / Done)
// - Add/Edit/Delete tasks with metadata
// - Drag & drop across and within columns (always enabled)
// - Per-task timer (auto-start in Doing, pause elsewhere)
// - Celebration on Done (confetti + coin sound)
// - Per-column sorting (manual, title, due date, priority, assignee, time spent)
// - Global search (title, description, assignee, subtask titles)
// - Subtasks (inline checklist + edit in modal)
// - Metadata Filtering (due date range, priority, assignee, time spent)
// - Theme & Personalization (colors, per-column header colors, background image)
// - NEW: Calendar View (month grid of tasks by due date)
// -------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import confetti from "canvas-confetti";

// ----- Columns -----
const STATUSES = ["To Do", "Doing", "Review", "Done"];

// ----- Sorting options (per column) -----
const SORT_OPTIONS = [
  { key: "manual", label: "Manual" },
  { key: "title", label: "Title (A→Z)" },
  { key: "due", label: "Due date" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee (A→Z)" },
  { key: "elapsed", label: "Time spent" },
];

const defaultSortForAll = () =>
  Object.fromEntries(STATUSES.map((s) => [s, { key: "manual", dir: "asc" }]));

// ----- Initial Board Data (in-memory) -----
const makeInitialColumns = () => {
  const cols = {};
  STATUSES.forEach((s) => (cols[s] = []));
  cols["To Do"] = [
    {
      id: 1,
      title: "Sample task",
      description: "Try dragging me, start a timer in Doing, and add subtasks",
      status: "To Do",
      priority: "Medium",
      assignee: "Alex",
      dueDate: "2025-12-10",
      subtasks: [
        { id: 101, title: "First subtask", done: false },
        { id: 102, title: "Second subtask", done: true },
      ],
    },
  ];
  return cols;
};

// ----- Utilities -----

// Deep clone helper (fallback for environments without structuredClone)
const clone = (obj) =>
  typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

// Normalize droppable id (future-proof if you add suffixes)
const baseCol = (id) => String(id).split(":")[0];

// Format ms -> HH:MM:SS
function fmt(ms = 0) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const prRank = (p) => ({ High: 3, Medium: 2, Low: 1 }[p] || 0);

const totalElapsed = (t) =>
  (t.elapsedMs || 0) + (t.isRunning && t.startedAt ? Date.now() - t.startedAt : 0);

// Build a comparator for current sort setting
const makeComparator = (sortKey, dir) => {
  const mul = dir === "desc" ? -1 : 1;
  return (a, b) => {
    let va, vb;
    switch (sortKey) {
      case "title":
        va = (a.title || "").toLowerCase();
        vb = (b.title || "").toLowerCase();
        if (va !== vb) return mul * va.localeCompare(vb);
        break;
      case "due": {
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (da !== db) return mul * (da - db);
        break;
      }
      case "priority": {
        const ra = prRank(a.priority);
        const rb = prRank(b.priority);
        if (ra !== rb) return mul * (ra - rb);
        break;
      }
      case "assignee":
        va = (a.assignee || "\uffff").toLowerCase(); // empty last
        vb = (b.assignee || "\uffff").toLowerCase();
        if (va !== vb) return mul * va.localeCompare(vb);
        break;
      case "elapsed": {
        const ea = totalElapsed(a);
        const eb = totalElapsed(b);
        if (ea !== eb) return mul * (ea - eb);
        break;
      }
      default:
        return 0; // manual
    }
    // deterministic tiebreaker
    return (a.id > b.id ? 1 : -1) * mul;
  };
};

// Case-insensitive contains
const contains = (s, q) => (s || "").toLowerCase().includes(q.toLowerCase());

// Match a task against the global search query
const matchesQuery = (task, q) => {
  if (!q.trim()) return true;
  if (contains(task.title, q)) return true;
  if (contains(task.description, q)) return true;
  if (contains(task.assignee, q)) return true;
  if (task.subtasks?.some((st) => contains(st.title, q))) return true;
  return false;
};

// ----- Theme / Personalization -----

const DEFAULT_THEME = {
  bg: "#0f172a",
  panel: "#111827",
  text: "#e5e7eb",
  accent: "#3b82f6",
  card: "#1f2937",
  border: "#334155",
  bgImage: null, // blob/object URL
  bgOpacity: 0.2,
  columnColors: {}, // { "To Do": "#hex", ... }
};

// Apply theme to document root via CSS variables
function applyTheme(theme) {
  const r = document.documentElement;
  r.style.setProperty("--bg", theme.bg);
  r.style.setProperty("--panel", theme.panel);
  r.style.setProperty("--text", theme.text);
  r.style.setProperty("--accent", theme.accent);
  r.style.setProperty("--card", theme.card);
  r.style.setProperty("--border", theme.border);
  r.style.setProperty("--bg-image-opacity", String(theme.bgOpacity ?? 0));
  const url = theme.bgImage ? `url("${theme.bgImage}")` : "none";
  r.style.setProperty("--bg-image-url", url);
}

// ----- NEW: Calendar helpers -----
const ymd = (d) => d.toISOString().slice(0, 10); // "YYYY-MM-DD"

// Build a 6x7 month grid starting on Sunday. Includes leading/trailing days.
function buildMonthMatrix(year, month /* 0-11 */) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0 Sun .. 6 Sat
  const start = new Date(year, month, 1 - startDow);
  const weeks = [];
  let cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      row.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export default function App() {
  // ----- Board State -----
  const [columns, setColumns] = useState(makeInitialColumns());
  const [colSort, setColSort] = useState(defaultSortForAll()); // per-column sort {key, dir}

  // Search box (global)
  const [query, setQuery] = useState("");

  // Metadata filter state
  const [filters, setFilters] = useState({
    dueAfter: "",
    dueBefore: "",
    priority: "",
    assignee: "",
    minMinutes: "",
    maxMinutes: "",
  });

  // Build assignee list from current tasks (memoized)
  const allAssignees = useMemo(() => {
    const set = new Set();
    for (const s of STATUSES) {
      for (const t of columns[s]) {
        if (t.assignee && t.assignee.trim()) set.add(t.assignee.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [columns]);

  // Modal form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    id: null,
    title: "",
    description: "",
    priority: "Medium",
    assignee: "",
    dueDate: "",
    status: "To Do",
    subtasks: [],
  });

  // ----- Timers -----
  // One global tick to update live timers and "elapsed" sort every second
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Timer helpers (accumulate elapsedMs, manage startedAt/isRunning)
  const stopTimer = (t) => {
    if (t?.isRunning && t?.startedAt) {
      const delta = Date.now() - t.startedAt;
      return { ...t, isRunning: false, startedAt: null, elapsedMs: (t.elapsedMs || 0) + delta };
    }
    return { ...t, isRunning: false, startedAt: null, elapsedMs: t.elapsedMs || 0 };
  };
  const startTimer = (t) => ({
    ...t,
    isRunning: true,
    startedAt: Date.now(),
    elapsedMs: t.elapsedMs || 0,
  });

  // ----- Audio + Confetti -----
  const audioCtxRef = useRef(null);
  const [soundReady, setSoundReady] = useState(false);

  useEffect(() => {
    // Create AudioContext once; many browsers require a user gesture to "unlock" it
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    } catch {}
  }, []);

  const enableSound = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    ctx.resume?.();
    setSoundReady(true);
  };

  // Simple retro "coin" sound (Web Audio API) - avoids shipping sound files
  const playCoin = () => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "suspended") return; // ensure user unlocked sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.3);
  };

  const fireConfetti = () => {
    const opts = { origin: { y: 0.7 }, spread: 70, startVelocity: 55, ticks: 90 };
    confetti({ ...opts, particleCount: 60 });
    setTimeout(() => confetti({ ...opts, particleCount: 80 }), 120);
  };

  // ----- Theme State -----
  const [theme, setTheme] = useState(() => {
    try {
      return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem("kanban-theme") || "{}") };
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [showTheme, setShowTheme] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("kanban-theme", JSON.stringify(theme));
  }, [theme]);

  // ----- NEW: Calendar state + derived data -----
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth()); // 0-11

  // Flatten tasks by due date (used by calendar view)
  const tasksByDate = useMemo(() => {
    const map = new Map();
    for (const col of STATUSES) {
      for (const t of columns[col]) {
        if (!t.dueDate) continue;
        const key = t.dueDate; // "YYYY-MM-DD"
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
      }
    }
    return map;
  }, [columns]);

  // ----- UI handlers -----
  const openAddForm = () => {
    setEditingId(null);
    setForm({
      id: null,
      title: "",
      description: "",
      priority: "Medium",
      assignee: "",
      dueDate: "",
      status: "To Do",
      subtasks: [],
    });
    setShowForm(true);
  };

  const openEditForm = (task) => {
    setEditingId(task.id);
    setForm({ ...task, subtasks: task.subtasks ? [...task.subtasks] : [] });
    setShowForm(true);
  };

  const saveTask = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setColumns((prev) => {
      const next = clone(prev);

      if (editingId) {
        // Update existing task
        const oldStatus = STATUSES.find((s) => next[s].some((x) => x.id === editingId));
        const oldIdx = next[oldStatus].findIndex((x) => x.id === editingId);
        let task = next[oldStatus][oldIdx];

        // Apply edits
        task = { ...task, ...form };

        // Handle timer change when status changes
        if (oldStatus !== form.status) {
          if (oldStatus === "Doing") task = stopTimer(task);
          if (form.status === "Doing") task = startTimer(task);
        }

        // Move to new status list
        next[oldStatus].splice(oldIdx, 1);
        next[form.status].push(task);

        // Celebrate if moved into Done via save
        if (form.status === "Done" && oldStatus !== "Done") {
          fireConfetti();
          playCoin();
        }
      } else {
        // Create new task
        let newTask = { ...form, id: Date.now() };
        if (newTask.status === "Doing") newTask = startTimer(newTask);
        next[newTask.status].push(newTask);
        if (newTask.status === "Done") {
          fireConfetti();
          playCoin();
        }
      }
      return next;
    });

    setShowForm(false);
    setEditingId(null);
  };

  const deleteTask = () => {
    if (!editingId) return;
    setColumns((prev) => {
      const next = clone(prev);
      const status = STATUSES.find((s) => next[s].some((t) => t.id === editingId));
      next[status] = next[status].filter((t) => t.id !== editingId);
      return next;
    });
    setShowForm(false);
    setEditingId(null);
  };

  // Drag & Drop handler (always enabled; within-column reorder + cross-column move)
  const onDragEnd = (result) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    const fromCol = baseCol(source.droppableId);
    const toCol = baseCol(destination.droppableId);

    let enteredDone = false;

    setColumns((prev) => {
      const next = clone(prev);

      const fromList = next[fromCol];
      const idx = fromList.findIndex((t) => String(t.id) === draggableId);
      let task = fromList[idx];

      // remove from source
      fromList.splice(idx, 1);

      if (fromCol === toCol) {
        // Manual reorder inside the same column (even if sorted, list may snap visually)
        next[toCol].splice(destination.index, 0, task);
        return next;
      }

      // Across columns: update timer + status
      if (fromCol === "Doing") task = stopTimer(task);
      if (toCol === "Doing") task = startTimer(task);
      task.status = toCol;

      next[toCol].splice(destination.index, 0, task);

      if (toCol === "Done") enteredDone = true;
      return next;
    });

    // Fire celebration right away (still in the gesture)
    if (enteredDone && fromCol !== "Done") {
      fireConfetti();
      playCoin();
    }
  };

  // Per-column sort controls
  const setColSortKey = (col, key) =>
    setColSort((prev) => ({ ...prev, [col]: { ...prev[col], key } }));
  const toggleColSortDir = (col) =>
    setColSort((prev) => ({
      ...prev,
      [col]: { ...prev[col], dir: prev[col].dir === "asc" ? "desc" : "asc" },
    }));

  // Toggle a subtask directly on the card
  const toggleSubtask = (taskId, col, subId) => {
    setColumns((prev) => {
      const next = clone(prev);
      const list = next[col];
      const idx = list.findIndex((t) => t.id === taskId);
      if (idx === -1) return prev;
      const t = list[idx];
      const subs = (t.subtasks || []).map((st) =>
        st.id === subId ? { ...st, done: !st.done } : st
      );
      list[idx] = { ...t, subtasks: subs };
      return next;
    });
  };

  // Subtasks editor helpers in modal
  const addFormSubtask = () => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setForm((f) => ({
      ...f,
      subtasks: [...(f.subtasks || []), { id, title: "", done: false }],
    }));
  };
  const updateFormSubtaskTitle = (sid, title) => {
    setForm((f) => ({
      ...f,
      subtasks: (f.subtasks || []).map((s) => (s.id === sid ? { ...s, title } : s)),
    }));
  };
  const removeFormSubtask = (sid) => {
    setForm((f) => ({
      ...f,
      subtasks: (f.subtasks || []).filter((s) => s.id !== sid),
    }));
  };

  // ----- FILTERING LOGIC -----
  const matchesFilters = (t) => {
    // due date range
    if (filters.dueAfter) {
      const taskTime = t.dueDate ? new Date(t.dueDate).getTime() : NaN;
      const afterTime = new Date(filters.dueAfter).getTime();
      if (!(taskTime >= afterTime)) return false;
    }
    if (filters.dueBefore) {
      const taskTime = t.dueDate ? new Date(t.dueDate).getTime() : NaN;
      const beforeTime = new Date(filters.dueBefore).getTime();
      if (!(taskTime <= beforeTime)) return false;
    }
    // priority exact match
    if (filters.priority && (t.priority || "") !== filters.priority) return false;
    // assignee exact match
    if (filters.assignee && (t.assignee || "") !== filters.assignee) return false;
    // time spent range (minutes)
    const mins = Math.floor(totalElapsed(t) / 60000);
    if (filters.minMinutes && mins < Number(filters.minMinutes)) return false;
    if (filters.maxMinutes && mins > Number(filters.maxMinutes)) return false;

    return true;
  };

  // ----- Render -----
  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban</h1>

        {/* Global search (filters all columns by title/description/assignee/subtasks) */}
        <div className="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, assignee, subtasks…"
          />
          {query && (
            <button className="tiny" onClick={() => setQuery("")} title="Clear">
              ✕
            </button>
          )}
        </div>

        {/* Header actions (kept as-is; just added a Calendar button) */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowCalendar(true)} title="Open calendar">📅 Calendar</button>
          <button onClick={() => setShowTheme(true)}>🎨 Theme</button>
          <button onClick={enableSound} title="Enable sound">
            {soundReady ? "🔊 Sound on" : "🔇 Enable sound"}
          </button>
          <button onClick={() => setShowCalendar(true)}>📅 Calendar</button>
          <button className="primary" onClick={openAddForm}>
            Add Task
          </button>
        </div>
      </header>

      {/* ---------- Metadata Filter Bar ---------- */}
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <label className="sort-control">
          Due after:
          <input
            type="date"
            value={filters.dueAfter}
            onChange={(e) => setFilters({ ...filters, dueAfter: e.target.value })}
          />
        </label>
        <label className="sort-control">
          Due before:
          <input
            type="date"
            value={filters.dueBefore}
            onChange={(e) => setFilters({ ...filters, dueBefore: e.target.value })}
          />
        </label>
        <label className="sort-control">
          Priority:
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
          >
            <option value="">Any</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </label>
        <label className="sort-control">
          Assignee:
          <select
            value={filters.assignee}
            onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}
          >
            <option value="">Anyone</option>
            {allAssignees.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="sort-control">
          Min mins:
          <input
            type="number"
            min="0"
            value={filters.minMinutes}
            onChange={(e) => setFilters({ ...filters, minMinutes: e.target.value })}
            placeholder="0"
            style={{ width: 80 }}
          />
        </label>
        <label className="sort-control">
          Max mins:
          <input
            type="number"
            min="0"
            value={filters.maxMinutes}
            onChange={(e) => setFilters({ ...filters, maxMinutes: e.target.value })}
            placeholder="∞"
            style={{ width: 80 }}
          />
        </label>
        <button
          className="tiny"
          onClick={() =>
            setFilters({
              dueAfter: "",
              dueBefore: "",
              priority: "",
              assignee: "",
              minMinutes: "",
              maxMinutes: "",
            })
          }
          title="Clear all filters"
        >
          Clear
        </button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="board">
          {STATUSES.map((col) => {
            const { key, dir } = colSort[col];
            const comparator = makeComparator(key, dir);

            // Apply search + metadata filters BEFORE sorting and rendering.
            const baseList = columns[col]
              .filter((t) => matchesQuery(t, query))
              .filter((t) => matchesFilters(t));

            const list = key === "manual" ? baseList : [...baseList].sort(comparator);

            return (
              <section className="column" key={col}>
                {/* Column header with per-column sort controls AND optional header color */}
                <header
                  className={`column-header ${theme.columnColors[col] ? "custom" : ""}`}
                  style={theme.columnColors[col] ? { background: theme.columnColors[col] } : {}}
                >
                  <span>{col}</span>
                  <div className="column-controls">
                    <label>
                      Sort:
                      <select
                        value={key}
                        onChange={(e) => setColSortKey(col, e.target.value)}
                      >
                        {SORT_OPTIONS.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="tiny"
                      onClick={() => toggleColSortDir(col)}
                      title="Toggle direction"
                    >
                      {dir === "asc" ? "↑" : "↓"}
                    </button>
                  </div>
                </header>

                <Droppable droppableId={col}>
                  {(provided, snapshot) => (
                    <div
                      className={`column-body ${snapshot.isDraggingOver ? "is-over" : ""}`}
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                    >
                      {list.map((t, index) => (
                        <Draggable draggableId={String(t.id)} index={index} key={t.id}>
                          {(dragProvided, dragSnapshot) => {
                            const doneCount = t.subtasks?.filter((s) => s.done).length || 0;
                            const totalCount = t.subtasks?.length || 0;

                            const card = (
                              <article
                                className={`card ${t.status === "Done" ? "done" : ""} ${
                                  dragSnapshot.isDragging ? "dragging" : ""
                                }`}
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                onClick={() => openEditForm(t)}
                                style={{
                                  ...dragProvided.draggableProps.style,
                                  cursor: "grab",
                                  boxShadow: dragSnapshot.isDragging
                                    ? "0 12px 30px rgba(0,0,0,0.45)"
                                    : "none",
                                }}
                              >
                                <div className="card-title">
                                  {t.title}
                                  {totalCount > 0 && (
                                    <span className="subtask-chip">
                                      {doneCount}/{totalCount}
                                    </span>
                                  )}
                                </div>

                                <div className="meta">
                                  <span className={`pill ${t.priority?.toLowerCase() || "medium"}`}>
                                    {t.priority || "Medium"}
                                  </span>
                                  {t.assignee && <span className="assignee">{t.assignee}</span>}
                                  {t.dueDate && <span className="due">Due {t.dueDate}</span>}
                                  <span className={`timer ${t.isRunning ? "" : "paused"}`}>
                                    ⏱{" "}
                                    {fmt(
                                      (t.elapsedMs || 0) +
                                        (t.isRunning && t.startedAt ? Date.now() - t.startedAt : 0)
                                    )}
                                  </span>
                                </div>

                                {t.description && <div className="desc">{t.description}</div>}

                                {/* Inline subtask checklist */}
                                {t.subtasks?.length > 0 && (
                                  <div className="subtasks">
                                    {t.subtasks.map((st) => (
                                      <label
                                        key={st.id}
                                        className={`subtask ${st.done ? "checked" : ""}`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={!!st.done}
                                          onChange={() => toggleSubtask(t.id, col, st.id)}
                                        />
                                        <span>{st.title || "(untitled)"}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </article>
                            );

                            // Render dragged item into <body> to avoid clipping under any overflow
                            return dragSnapshot.isDragging
                              ? createPortal(card, document.body)
                              : card;
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      </DragDropContext>

      {/* ----- Task Modal (Add/Edit) ----- */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? "Edit Task" : "Add Task"}</h2>
            <form onSubmit={saveTask} className="form">
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Short title"
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Details (optional)"
                />
              </label>

              <div className="row">
                <label className="grow">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>

                <label className="grow">
                  Assignee
                  <input
                    value={form.assignee}
                    onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    placeholder="Name"
                  />
                </label>
              </div>

              <div className="row">
                <label className="grow">
                  Due Date
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </label>

                <label className="grow">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Subtasks Editor */}
              <div className="subtasks-editor">
                <div className="subtasks-title-row">
                  <strong>Subtasks</strong>
                  <button type="button" className="tiny" onClick={addFormSubtask}>
                    + Add subtask
                  </button>
                </div>

                {(form.subtasks || []).length === 0 && (
                  <div className="subtasks-empty">No subtasks yet.</div>
                )}

                {(form.subtasks || []).map((s) => (
                  <div className="subtask-edit-row" key={s.id}>
                    <input
                      value={s.title}
                      onChange={(e) => updateFormSubtaskTitle(s.id, e.target.value)}
                      placeholder="Subtask title"
                    />
                    <button
                      type="button"
                      className="tiny"
                      onClick={() => removeFormSubtask(s.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="actions">
                {editingId && (
                  <button
                    type="button"
                    onClick={deleteTask}
                    style={{ background: "#b91c1c", color: "white" }}
                  >
                    Delete
                  </button>
                )}
                <button type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  {editingId ? "Save" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----- NEW: Calendar Modal ----- */}
      {showCalendar && (
        <div className="modal-backdrop" onClick={() => setShowCalendar(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-header">
              <button
                className="tiny"
                onClick={() => {
                  const m = calMonth - 1;
                  if (m < 0) {
                    setCalMonth(11);
                    setCalYear(calYear - 1);
                  } else {
                    setCalMonth(m);
                  }
                }}
              >
                ←
              </button>
              <h2 style={{ margin: 0 }}>
                {new Date(calYear, calMonth, 1).toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <button
                className="tiny"
                onClick={() => {
                  const m = calMonth + 1;
                  if (m > 11) {
                    setCalMonth(0);
                    setCalYear(calYear + 1);
                  } else {
                    setCalMonth(m);
                  }
                }}
              >
                →
              </button>
            </div>

            <div className="calendar-grid">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="cal-dow">{d}</div>
              ))}

              {buildMonthMatrix(calYear, calMonth).flat().map((dateObj, idx) => {
                const key = ymd(dateObj);
                const inMonth = dateObj.getMonth() === calMonth;
                const items = tasksByDate.get(key) || [];
                return (
                  <div key={key + idx} className={`cal-cell ${inMonth ? "" : "dim"}`}>
                    <div className="cal-day">{dateObj.getDate()}</div>

                    <div className="cal-list">
                      {items.length === 0 && <div className="cal-empty">—</div>}
                      {items.map((t) => (
                        <button
                          key={t.id}
                          className={`cal-pill pill ${t.priority?.toLowerCase() || "medium"} ${t.status === "Done" ? "done-pill" : ""}`}
                          title={`${t.title} (${t.status})`}
                          onClick={() => {
                            setShowCalendar(false);
                            openEditForm(t);
                          }}
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="calendar-footer">
              <span className="legend">
                <span className="pill low">Low</span>
                <span className="pill medium">Med</span>
                <span className="pill high">High</span>
                <span className="pill done-pill">Done</span>
              </span>
              <div style={{ flex: 1 }} />
              <button className="primary" onClick={() => setShowCalendar(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ----- Theme / Personalization Panel ----- */}
      {showTheme && (
        <div className="modal-backdrop" onClick={() => setShowTheme(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Customize Theme</h2>

            <div className="theme-panel">
              {/* Base palette */}
              <div className="theme-row">
                <label style={{ width: 120 }}>Background</label>
                <input
                  type="color"
                  value={theme.bg}
                  onChange={(e) => setTheme({ ...theme, bg: e.target.value })}
                />
              </div>
              <div className="theme-row">
                <label style={{ width: 120 }}>Panel</label>
                <input
                  type="color"
                  value={theme.panel}
                  onChange={(e) => setTheme({ ...theme, panel: e.target.value })}
                />
              </div>
              <div className="theme-row">
                <label style={{ width: 120 }}>Card</label>
                <input
                  type="color"
                  value={theme.card}
                  onChange={(e) => setTheme({ ...theme, card: e.target.value })}
                />
              </div>
              <div className="theme-row">
                <label style={{ width: 120 }}>Text</label>
                <input
                  type="color"
                  value={theme.text}
                  onChange={(e) => setTheme({ ...theme, text: e.target.value })}
                />
              </div>
              <div className="theme-row">
                <label style={{ width: 120 }}>Accent</label>
                <input
                  type="color"
                  value={theme.accent}
                  onChange={(e) => setTheme({ ...theme, accent: e.target.value })}
                />
              </div>
              <div className="theme-row">
                <label style={{ width: 120 }}>Border</label>
                <input
                  type="color"
                  value={theme.border}
                  onChange={(e) => setTheme({ ...theme, border: e.target.value })}
                />
              </div>

              {/* Background image upload + opacity */}
              <div className="theme-row" style={{ gridColumn: "1 / -1" }}>
                <div className="bg-upload">
                  <label style={{ width: 120 }}>Background image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      // Revoke previous blob URL to avoid leaks
                      if (theme.bgImage?.startsWith("blob:")) URL.revokeObjectURL(theme.bgImage);
                      const url = URL.createObjectURL(f);
                      setTheme({ ...theme, bgImage: url });
                    }}
                  />
                  <label>Opacity</label>
                  <input
                    className="range"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={theme.bgOpacity}
                    onChange={(e) =>
                      setTheme({ ...theme, bgOpacity: parseFloat(e.target.value) })
                    }
                  />
                  <button
                    className="tiny"
                    onClick={() => {
                      if (theme.bgImage?.startsWith("blob:")) URL.revokeObjectURL(theme.bgImage);
                      setTheme({ ...theme, bgImage: null, bgOpacity: 0 });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Per-column header colors */}
              {STATUSES.map((s) => (
                <div className="theme-row" key={s}>
                  <label style={{ width: 120 }}>{s} header</label>
                  <input
                    type="color"
                    value={theme.columnColors[s] || "#000000"}
                    onChange={(e) =>
                      setTheme({
                        ...theme,
                        columnColors: { ...theme.columnColors, [s]: e.target.value },
                      })
                    }
                  />
                  <button
                    className="tiny"
                    onClick={() =>
                      setTheme({
                        ...theme,
                        columnColors: { ...theme.columnColors, [s]: undefined },
                      })
                    }
                  >
                    Reset
                  </button>
                </div>
              ))}

              <div className="theme-footer">
                <button
                  onClick={() => {
                    if (theme.bgImage?.startsWith("blob:")) URL.revokeObjectURL(theme.bgImage);
                    setTheme(DEFAULT_THEME);
                  }}
                >
                  Reset all
                </button>
                <button className="primary" onClick={() => setShowTheme(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
