import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import confetti from "canvas-confetti";

const STATUSES = ["To Do", "Doing", "Review", "Done"];

const SORT_OPTIONS = [
  { key: "manual", label: "Manual (drag order)" },
  { key: "title", label: "Title (A→Z)" },
  { key: "due", label: "Due date" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee (A→Z)" },
  { key: "elapsed", label: "Time spent" },
];

const makeInitialColumns = () => {
  const cols = {};
  STATUSES.forEach((s) => (cols[s] = []));
  cols["To Do"] = [
    { id: 1, title: "Sample task", status: "To Do", priority: "Medium" },
  ];
  return cols;
};

// deep clone helper (fallback for older browsers)
const clone = (obj) =>
  typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

// normalize droppable ids if you ever add suffixes
const baseCol = (id) => String(id).split(":")[0];

// format ms -> HH:MM:SS
function fmt(ms = 0) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// priority rank (higher = more important)
const prRank = (p) => ({ High: 3, Medium: 2, Low: 1 }[p] || 0);

// compute total elapsed (including live)
const totalElapsed = (t) =>
  (t.elapsedMs || 0) + (t.isRunning && t.startedAt ? Date.now() - t.startedAt : 0);

// build a comparator based on sortKey/direction
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

      case "assignee": {
        va = (a.assignee || "\uffff").toLowerCase(); // empty last
        vb = (b.assignee || "\uffff").toLowerCase();
        if (va !== vb) return mul * va.localeCompare(vb);
        break;
      }

      case "elapsed": {
        const ea = totalElapsed(a);
        const eb = totalElapsed(b);
        if (ea !== eb) return mul * (ea - eb);
        break;
      }

      default:
        // "manual" -> no sorting
        return 0;
    }

    // deterministic tie-breaker by id
    return (a.id > b.id ? 1 : -1) * mul;
  };
};

export default function App() {
  const [columns, setColumns] = useState(makeInitialColumns());
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
  });

  // sorting state
  const [sortKey, setSortKey] = useState("manual");
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"
  const comparator = makeComparator(sortKey, sortDir);

  // global tick: re-render timers once per second (keeps "elapsed" sort fresh)
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Audio setup + unlock
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
    if (!ctx || ctx.state === "suspended") return; // need unlock
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
    });
    setShowForm(true);
  };

  const openEditForm = (task) => {
    setEditingId(task.id);
    setForm({ ...task });
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

      // move within same column
      if (fromCol === toCol) {
        if (sortKey === "manual") {
          // manual reorder allowed
          next[toCol].splice(destination.index, 0, task);
        } else {
          // when sorted, ignore manual indices; just put back and let sorting control the view
          next[toCol].push(task);
        }
        return next;
      }

      // across columns
      if (fromCol === "Doing") task = stopTimer(task);
      if (toCol === "Doing") task = startTimer(task);
      task.status = toCol;

      if (sortKey === "manual") {
        next[toCol].splice(destination.index, 0, task);
      } else {
        next[toCol].push(task);
      }

      if (toCol === "Done") enteredDone = true;

      return next;
    });

    // fire immediately (still part of the gesture)
    if (enteredDone && fromCol !== "Done") {
      fireConfetti();
      playCoin();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban</h1>
        <div className="toolbar">
          <label className="sort-control">
            Sort by:
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
          {sortKey !== "manual" && (
            <span className="note">Tip: manual reordering is disabled while sorted.</span>
          )}
          <div className="spacer" />
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
          {STATUSES.map((col) => (
            <section className="column" key={col}>
              <header className="column-header">{col}</header>

              <Droppable droppableId={col}>
                {(provided, snapshot) => (
                  <div
                    className={`column-body ${
                      snapshot.isDraggingOver ? "is-over" : ""
                    }`}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {(sortKey === "manual"
                      ? columns[col]
                      : [...columns[col]].sort(comparator)
                    ).map((t, index) => (
                      <Draggable
                        draggableId={String(t.id)}
                        index={index}
                        key={t.id}
                        isDragDisabled={sortKey !== "manual"} // disable reordering when sorted
                      >
                        {(dragProvided, dragSnapshot) => {
                          const card = (
                            <article
                              className={`card ${
                                t.status === "Done" ? "done" : ""
                              } ${dragSnapshot.isDragging ? "dragging" : ""}`}
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...(sortKey === "manual"
                                ? dragProvided.dragHandleProps
                                : dragProvided.draggableProps)}
                              onClick={() => openEditForm(t)}
                              style={{
                                ...dragProvided.draggableProps.style,
                                cursor: sortKey === "manual" ? "grab" : "default",
                                boxShadow: dragSnapshot.isDragging
                                  ? "0 12px 30px rgba(0,0,0,0.45)"
                                  : "none",
                              }}
                            >
                              <div className="card-title">{t.title}</div>
                              <div className="meta">
                                <span
                                  className={`pill ${
                                    t.priority?.toLowerCase() || "medium"
                                  }`}
                                >
                                  {t.priority || "Medium"}
                                </span>
                                {t.assignee && (
                                  <span className="assignee">{t.assignee}</span>
                                )}
                                {t.dueDate && (
                                  <span className="due">Due {t.dueDate}</span>
                                )}
                                <span
                                  className={`timer ${
                                    t.isRunning ? "" : "paused"
                                  }`}
                                >
                                  ⏱{" "}
                                  {fmt(
                                    (t.elapsedMs || 0) +
                                      (t.isRunning && t.startedAt
                                        ? Date.now() - t.startedAt
                                        : 0)
                                  )}
                                </span>
                              </div>
                              {t.description && (
                                <div className="desc">{t.description}</div>
                              )}
                            </article>
                          );
                          // Render dragged item to <body> so it never gets clipped
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
          ))}
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
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
                  }
                  placeholder="Short title"
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="Details (optional)"
                />
              </label>
              <div className="row">
                <label className="grow">
                  Priority
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({ ...form, priority: e.target.value })
                    }
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
                    onChange={(e) =>
                      setForm({ ...form, assignee: e.target.value })
                    }
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
                    onChange={(e) =>
                      setForm({ ...form, dueDate: e.target.value })
                    }
                  />
                </label>
                <label className="grow">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
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
