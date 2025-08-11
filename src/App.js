import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import confetti from "canvas-confetti";

const STATUSES = ["To Do", "Doing", "Review", "Done"];

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

const makeInitialColumns = () => {
  const cols = {};
  STATUSES.forEach((s) => (cols[s] = []));
  cols["To Do"] = [
    {
      id: 1,
      title: "Sample task",
      description: "Try adding subtasks and drag me around",
      status: "To Do",
      priority: "Medium",
      assignee: "",
      dueDate: "",
      // NEW: subtasks (checklist)
      subtasks: [
        { id: 101, title: "First subtask", done: false },
        { id: 102, title: "Second subtask", done: true },
      ],
    },
  ];
  return cols;
};

// deep clone helper
const clone = (obj) =>
  typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
const baseCol = (id) => String(id).split(":")[0];

// format ms -> HH:MM:SS
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
        va = (a.assignee || "\uffff").toLowerCase();
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
    return (a.id > b.id ? 1 : -1) * mul;
  };
};

// case-insensitive contains
const contains = (s, q) => (s || "").toLowerCase().includes(q.toLowerCase());

// match task against global search
const matchesQuery = (task, q) => {
  if (!q.trim()) return true;
  if (contains(task.title, q)) return true;
  if (contains(task.description, q)) return true;
  if (contains(task.assignee, q)) return true;
  if (task.subtasks?.some((st) => contains(st.title, q))) return true;
  return false;
};

export default function App() {
  const [columns, setColumns] = useState(makeInitialColumns());
  const [colSort, setColSort] = useState(defaultSortForAll()); // per-column {key, dir}

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
    subtasks: [], // NEW
  });

  // NEW: global search
  const [query, setQuery] = useState("");

  // global tick for timers (and elapsed sort)
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Audio
  const audioCtxRef = useRef(null);
  const [soundReady, setSoundReady] = useState(false);
  useEffect(() => {
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
  const playCoin = () => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "suspended") return;
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

  // timers
  const stopTimer = (t) => {
    if (t?.isRunning && t?.startedAt) {
      const delta = Date.now() - t.startedAt;
      return {
        ...t,
        isRunning: false,
        startedAt: null,
        elapsedMs: (t.elapsedMs || 0) + delta,
      };
    }
    return { ...t, isRunning: false, startedAt: null, elapsedMs: t.elapsedMs || 0 };
  };
  const startTimer = (t) => ({
    ...t,
    isRunning: true,
    startedAt: Date.now(),
    elapsedMs: t.elapsedMs || 0,
  });

  const saveTask = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setColumns((prev) => {
      const next = clone(prev);

      if (editingId) {
        const oldStatus = STATUSES.find((s) => next[s].some((x) => x.id === editingId));
        const oldIdx = next[oldStatus].findIndex((x) => x.id === editingId);
        let task = next[oldStatus][oldIdx];

        task = { ...task, ...form };

        if (oldStatus !== form.status) {
          if (oldStatus === "Doing") task = stopTimer(task);
          if (form.status === "Doing") task = startTimer(task);
        }

        next[oldStatus].splice(oldIdx, 1);
        next[form.status].push(task);

        if (form.status === "Done" && oldStatus !== "Done") {
          fireConfetti();
          playCoin();
        }
      } else {
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
        // always allow drag; sorted lists will snap back visually
        next[toCol].splice(destination.index, 0, task);
        return next;
      }

      // across columns
      if (fromCol === "Doing") task = stopTimer(task);
      if (toCol === "Doing") task = startTimer(task);
      task.status = toCol;

      next[toCol].splice(destination.index, 0, task);
      if (toCol === "Done") enteredDone = true;
      return next;
    });

    if (enteredDone && fromCol !== "Done") {
      fireConfetti();
      playCoin();
    }
  };

  const setColSortKey = (col, key) =>
    setColSort((prev) => ({ ...prev, [col]: { ...prev[col], key } }));
  const toggleColSortDir = (col) =>
    setColSort((prev) => ({
      ...prev,
      [col]: { ...prev[col], dir: prev[col].dir === "asc" ? "desc" : "asc" },
    }));

  // subtask quick toggle from card
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

  // helpers for editing form's subtask list (local to modal form)
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban</h1>

        {/* NEW: global search */}
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

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={enableSound} title="Enable sound">
            {soundReady ? "🔊 Sound on" : "🔇 Enable sound"}
          </button>
          <button className="primary" onClick={openAddForm}>
            Add Task
          </button>
        </div>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="board">
          {STATUSES.map((col) => {
            const { key, dir } = colSort[col];
            const comparator = makeComparator(key, dir);
            const baseList = columns[col].filter((t) => matchesQuery(t, query));
            const list = key === "manual" ? baseList : [...baseList].sort(comparator);

            return (
              <section className="column" key={col}>
                <header className="column-header">
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

                                {/* NEW: inline subtask checklist */}
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

      {/* Modal */}
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

              {/* NEW: Subtasks editor */}
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
    </div>
  );
}
