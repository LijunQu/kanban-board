// mockApi.js
// Minimal mock backend with configurable size and realistic delays.
// Example usage in App.js:
//   import { fetchTasks, createTask, updateTask, deleteTask } from "./mockApi";
//   fetchTasks({ count: 1200, minDelay: 200, maxDelay: 1200 })

const STATUSES = ["To Do", "Doing", "Review", "Done"];
const PRIORITIES = ["Low", "Medium", "High"];
const NAMES = ["Alex", "Sam", "Taylor", "Jordan", "Riley", "Casey", "Morgan", "Jamie"];

let SERVER = {
  tasks: [],
  nextId: 100000, // separate server-side id space
  latency: { min: 200, max: 1200 },
  errorRate: 0.05, // 5% random failure for update/delete (helps test error paths)
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[rand(0, arr.length - 1)];
const maybe = (p) => Math.random() < p;

function generateTasks(count) {
  const out = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const status = STATUSES[rand(0, STATUSES.length - 1)];
    const pr = pick(PRIORITIES);
    const assignee = maybe(0.85) ? pick(NAMES) : ""; // some left blank
    const dueOffsetDays = rand(-20, 30);
    const dueDate = new Date(now + dueOffsetDays * 86400000).toISOString().slice(0, 10);
    const subCount = maybe(0.6) ? rand(1, 3) : 0;
    const subtasks = Array.from({ length: subCount }, (_, k) => ({
      id: SERVER.nextId++,
      title: `Subtask ${k + 1}`,
      done: maybe(0.4),
    }));

    out.push({
      id: SERVER.nextId++,
      title: `Task #${i + 1}`,
      description: maybe(0.5) ? `Auto-generated description for task ${i + 1}` : "",
      status,
      priority: pr,
      assignee,
      dueDate,
      subtasks,
      elapsedMs: maybe(0.7) ? rand(0, 3 * 60 * 60 * 1000) : 0,
      isRunning: status === "Doing" && maybe(0.5),
      startedAt: null,
    });
  }
  // If running, set startedAt so elapsed can tick on client
  out.forEach((t) => {
    if (t.isRunning) t.startedAt = Date.now() - rand(1, 25) * 60000;
  });
  return out;
}

function setLatency({ minDelay, maxDelay } = {}) {
  if (typeof minDelay === "number") SERVER.latency.min = Math.max(0, minDelay);
  if (typeof maxDelay === "number") SERVER.latency.max = Math.max(SERVER.latency.min, maxDelay);
}

async function withDelay(fn) {
  const { min, max } = SERVER.latency;
  await sleep(rand(min, max));
  return fn();
}

// Public API
export async function fetchTasks({ count = 1000, minDelay = 250, maxDelay = 1200 } = {}) {
  setLatency({ minDelay, maxDelay });
  return withDelay(() => {
    SERVER.tasks = generateTasks(count);
    // return deep copy
    return JSON.parse(JSON.stringify(SERVER.tasks));
  });
}

export async function createTask(task) {
  return withDelay(() => {
    const serverTask = { ...task, id: SERVER.nextId++ };
    SERVER.tasks.push(serverTask);
    return JSON.parse(JSON.stringify(serverTask));
  });
}

export async function updateTask(task) {
  return withDelay(() => {
    if (maybe(SERVER.errorRate)) {
      const err = new Error("Mock 500: failed to update");
      err.code = 500;
      throw err;
    }
    const idx = SERVER.tasks.findIndex((t) => t.id === task.id);
    if (idx !== -1) SERVER.tasks[idx] = { ...SERVER.tasks[idx], ...task };
    return JSON.parse(JSON.stringify(SERVER.tasks[idx]));
  });
}

export async function deleteTask(id) {
  return withDelay(() => {
    if (maybe(SERVER.errorRate)) {
      const err = new Error("Mock 500: failed to delete");
      err.code = 500;
      throw err;
    }
    SERVER.tasks = SERVER.tasks.filter((t) => t.id !== id);
    return { ok: true };
  });
}
