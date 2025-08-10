import { useEffect, useRef, useState } from "react";
import "./App.css";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import confetti from "canvas-confetti";
import { createPortal } from "react-dom";

const STATUSES = ["To Do", "Doing", "Review", "Done"];

const makeInitialColumns = () => {
  const cols = {};
  STATUSES.forEach((s) => (cols[s] = []));
  cols["To Do"] = [
    { id: 1, title: "Sample task", status: "To Do", priority: "Medium" },
  ];
  return cols;
};

// deep clone helper
const clone = (obj) =>
  typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));

// format ms -> HH:MM:SS
function fmt(ms = 0) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

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

  // tick for timers
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // celebration trigger (increment to fire)
  const [celebrateCount, setCelebrateCount] = useState(0);
  const lastFireRef = useRef(0);

  // Audio
  const audioCtxRef = useRef(null);
  useEffect(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    } catch {}
  }, []);

  const playCoin = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

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

  // fire celebration when counter changes (debounced to avoid double in StrictMode)
  useEffect(() => {
    if (celebrateCount <= 0) return;
    const now = Date.now();
    if (now - lastFireRef.current < 150) return;
    lastFireRef.current = now;
    fireConfetti();
    playCoin();
  }, [celebrateCount]);

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
          setCelebrateCount((c) => c + 1);
        }
      } else {
        let newTask = { ...form, id: Date.now() };
        if (newTask.status === "Doing") newTask = startTimer(newTask);
        next[newTask.status].push(newTask);
        if (newTask.status === "Done") setCelebrateCount((c) => c + 1);
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

    const fromCol = source.droppableId;
    const toCol = destination.droppableId;

    let enteredDone = false;

    setColumns((prev) => {
      const next = clone(prev);

      const fromList = next[fromCol];
      const idx = fromList.findIndex((t) => String(t.id) === draggableId);
      let task = fromList[idx];

      fromList.splice(idx, 1);

      if (fromCol !== toCol) {
        if (fromCol === "Doing") task = stopTimer(task);
        if (toCol === "Doing") task = startTimer(task);
        task.status = toCol;
        if (toCol === "Done") enteredDone = true;
      }

      next[toCol].splice(destination.index, 0, task);
      return next;
    });

    if (enteredDone && fromCol !== "Done") {
      setCelebrateCount((c) => c + 1);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kanban</h1>
        <button className="primary" onClick={openAddForm}>
          Add Task
        </button>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="board">
          {STATUSES.map((col) => (
            <section className="column" key={col}>
              <header className="column-header">{col}</header>

              <Droppable droppableId={col}>
                {(provided) => (
                  <div
                    className="column-body"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {columns[col].map((t, index) => (
                      <Draggable draggableId={String(t.id)} index={index} key={t.id}>
                        {(dragProvided, snapshot) => {
                          const card = (
                            <article
                              className={`card ${t.status === "Done" ? "done" : ""} ${snapshot.isDragging ? "dragging" : ""}`}
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => openEditForm(t)}
                              style={{
                                ...dragProvided.draggableProps.style,
                                cursor: "grab",
                                boxShadow: snapshot.isDragging ? "0 12px 30px rgba(0,0,0,0.45)" : "none",
                              }}
                            >
                              <div className="card-title">{t.title}</div>
                              <div className="meta">
                                <span className={`pill ${t.priority?.toLowerCase() || "medium"}`}>
                                  {t.priority || "Medium"}
                                </span>
                                {t.assignee && <span className="assignee">{t.assignee}</span>}
                                {t.dueDate && <span className="due">Due {t.dueDate}</span>}
                                <span className={`timer ${t.isRunning ? "" : "paused"}`}>
                                  ⏱ {fmt((t.elapsedMs || 0) + (t.isRunning && t.startedAt ? Date.now() - t.startedAt : 0))}
                                </span>
                              </div>
                              {t.description && <div className="desc">{t.description}</div>}
                            </article>
                          );
                          // render dragged item to <body> so it never gets clipped
                          return snapshot.isDragging ? createPortal(card, document.body) : card;
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
