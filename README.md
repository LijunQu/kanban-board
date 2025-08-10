Lijun's Kanban board
====================

Fist: setup
-----------

I used these commands to create a project.

npm -v

npx -v

npx create-react-app kanban-board

Now http://localhost:3000/ looks like this:

![](./setup.png)


Step 2: Framework
-----------------

## Design Choices

I love to plan things out in priority order and specify my tasks.  
To support this, I implemented a **priority level** field and encourage users to include detailed descriptions, so they have all the context they need later.  

The Kanban board includes four stages — **To Do**, **Doing**, **Review**, and **Done** — arranged in a logical time order to reflect the natural progression of work.

Now I have:

![](./step2.png)
![](./addTask.png)
![](./editTask.png)