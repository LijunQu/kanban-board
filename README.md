Lijun's Kanban board
====================

## First: setup


I used these commands to create a project.

npm -v

npx -v

npx create-react-app kanban-board

Now http://localhost:3000/ looks like this:

![](./setup.png)


## Step 2: Framework (20 min)


Features
---------

Four Columns in Time Order: To Do → Doing → Review → Done. Done tasks are grey.

Add Task: Click "Add Task" to open a form for entering task details (title, description, priority, assignee, due date, status).

Edit Task: Click on any task card to open a pre-filled edit form where you can modify all details.

Delete Task: While editing, click the Delete button to remove the task from the board.

Priority Levels: Low, Medium, High — shown as color-coded labels on each task.

Responsive Layout: Works on desktop and mobile sizes.


Design Choices
--------------

I love to plan things out in priority order and specify my tasks.
To support this, I implemented a priority level field and encourage users to include detailed descriptions, so they have all the context they need later.

The Kanban board includes four stages — To Do, Doing, Review, and Done — arranged in a logical time order to reflect the natural progression of work.

Now I have:

![](./step2.png)
![](./addTask.png)
![](./editTask.png)


## Step 3: Draging and Moving (50 min)


Features
---------------------

Drag & Drop: Reorder within a column and move tasks between To Do / Doing / Review / Done via `@hello-pangea/dnd`. Status updates on drop. I tried to make the dragging process as smooth as possible.

Per-Task Timer: When a card is in Doing, its timer auto-starts; moving it out of Doing auto-pauses. The timer stays visible and accumulates time.

Celebration on Done: Dropping or saving a task into Done triggers fireworks (`canvas-confetti`) and a retro coin chime (Web Audio synth).

Lightweight & Snappy: One global tick drives all timers; confetti bursts are short; drag operations avoid unnecessary re-renders.


Design Choices
--------------

I want users to know exactly how much time they spend on each task and to feel a clear sense of achievement when they finish. The board auto-starts a per-task timer when a card enters **Doing** and pauses it when the card leaves; the timer stays visible everywhere and accumulates total time (HH:MM:SS). This gives immediate feedback for focus, effort tracking, and retrospectives.

To emphasize accomplishment, moving a card into **Done** triggers a brief celebration (confetti + a retro coin chime). It’s lightweight and non-blocking, but creates a positive moment that reinforces progress and motivation.


Notes
-------

Dependencies are installed with `npm install` (includes `@hello-pangea/dnd` and `canvas-confetti`).

Now I have:

![](./step3.png)
![](./doneTask.png)


## Step 4: Sorting Tasks (20 min)


Features
---------

Per-Column Sorting: Each Kanban column (To Do / Doing / Review / Done) can be sorted independently without affecting the others.

Sorting Criteria: Sort tasks within a column by:

Alphabetical — Task title A→Z or Z→A.

Due Date — Soonest or latest first.

Priority — High → Medium → Low, or reverse.

Assignee — Sort by assignee name alphabetically.

Time Spent — Sort by accumulated timer value (longest or shortest).

Always Draggable: Tasks remain draggable even while sorted, so you can reposition any card manually anytime.

Quick Switching: You can sort one column by due date and another by timer at the same time, allowing you to optimize each workflow stage differently.

Design Choices
----------------

I wanted to give users maximum flexibility in organizing tasks, since different workflow stages often require different priorities. For example, Done might be best sorted by due date for reporting, while Review might benefit from sorting by time spent.

By keeping sorting independent per column and allowing drag at all times, the board never locks you into a single rigid view — you can blend structured sorting with freeform reordering for the most efficient task management.

Notes
---------
Sorting controls are built into each column header for quick access. Sorting is instant and lightweight, with no effect on other columns.


Now the kanban board looks like this:

![](./step4.png)


## Step 5: Search & Subtasks (20 min)


Features
----------

Global Search: A search box in the header filters tasks in all columns in real time. Matches are case-insensitive and include task title, description, assignee, and all subtask titles. This makes it easy to instantly find relevant items without scrolling or guessing which column it’s in.

Subtasks (Checklist): Each task can have a checklist of smaller subtasks. Add or edit subtasks in the task modal, reorder them, and toggle completion directly from the card without opening it. Each card shows a progress chip (done/total) so you can track progress at a glance.

Design Choices
---------------

The global search ensures that even large, multi-column boards remain manageable—users can find what they need without losing focus or manually scanning columns. By searching across all major fields (including subtasks), we reduce friction and improve retrieval time.

The subtask checklist supports breaking down large goals into smaller actionable steps. Visible progress chips help sustain motivation, while inline toggles make it quick to update progress. Subtasks do not leave their parent’s card, keeping related work visually grouped.

Now my kanban board become:
![](./subtask.png)
![](./search.png)