import { useState } from "react";
import "./App.css";

const STATUSES = ["To Do", "Doing", "Review", "Done"];

export default function App() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Sample task", status: "To Do", priority: "Medium" },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // NEW: track if editing
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "Medium",
    assignee: "",
    dueDate: "",
    status: "To Do",
  });

  const openAddForm = () => {
    setEditingId(null);
    setForm({
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
    setForm(task);
    setShowForm(true);
  };

  const saveTask = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    if (editingId) {
      // update existing
      setTasks((prev) =>
        prev.map((t) => (t.id === editingId ? { ...form } : t))
      );
    } else {
      // add new
      setTasks((prev) => [
        ...prev,
        { id: Date.now(), ...form },
      ]);
    }

    setShowForm(false);
    setEditingId(null);
  };

  const deleteTask = () => {
    if (editingId) {
      setTasks((prev) => prev.filter((t) => t.id !== editingId));
      setShowForm(false);
      setEditingId(null);
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

      {/* Board */}
      <div className="board">
        {STATUSES.map((col) => (
          <Column key={col} title={col}>
            {tasks
              .filter((t) => t.status === col)
              .map((t) => (
                <TaskCard key={t.id} task={t} onClick={() => openEditForm(t)} />
              ))}
          </Column>
        ))}
      </div>

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

function Column({ title, children }) {
  return (
    <section className="column">
      <header className="column-header">{title}</header>
      <div className="column-body">{children}</div>
    </section>
  );
}

function TaskCard({ task, onClick }) {
  return (
    <article
      className={`card ${task.status === "Done" ? "done" : ""}`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <div className="card-title">{task.title}</div>
      <div className="meta">
        <span className={`pill ${task.priority.toLowerCase()}`}>
          {task.priority}
        </span>
        {task.assignee && <span className="assignee">{task.assignee}</span>}
        {task.dueDate && <span className="due">Due {task.dueDate}</span>}
      </div>
      {task.description && <div className="desc">{task.description}</div>}
    </article>
  );
}

