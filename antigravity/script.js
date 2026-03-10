/* =============================================
   DayFlow – Daily Planner
   script.js
   ============================================= */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let tasks = [];
let settings = {
  darkMode: false,
  accent: 'violet',
  notifications: false,
  displayName: 'User',
};
let currentFilter = 'all';
let currentPriorityFilter = 'all';
let currentCategoryFilter = 'all';
let searchQuery = '';
let calendarDate = new Date();
let calendarSelectedDate = null;
let dragSrcIndex = null;

// Charts
let priorityChartInst = null;
let completionChartInst = null;
let categoryChartInst = null;
let weeklyChartInst = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  applySettings();
  setupNavigation();
  setupTopbar();
  setupModal();
  setupConfirmDialog();
  setupSettings();
  setupDragAndDrop();
  setupCalendar();
  updateDashboard();
  renderTasksGrid();
  renderCalendar();
  scheduleNotifications();
  setInterval(scheduleNotifications, 60 * 1000);
});

// ─── Persistence ──────────────────────────────────────────────────────────────
function loadData() {
  try {
    tasks = JSON.parse(localStorage.getItem('df_tasks') || '[]');
    const s = JSON.parse(localStorage.getItem('df_settings') || '{}');
    settings = { ...settings, ...s };
  } catch (e) {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem('df_tasks', JSON.stringify(tasks));
}

function saveSettings() {
  localStorage.setItem('df_settings', JSON.stringify(settings));
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return dueDate < today();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function priorityLabel(p) {
  return { high: '🔴 High', medium: '🟡 Medium', low: '🟢 Low' }[p] || p;
}

function categoryLabel(c) {
  return { work: '💼 Work', study: '📚 Study', personal: '🏠 Personal' }[c] || c;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 310);
  }, 3000);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.section);
      closeSidebar();
    });
  });

  // see-all links
  document.querySelectorAll('.see-all').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.section);
    });
  });
}

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`section-${section}`);
  const navItem = document.getElementById(`nav-${section}`);

  if (target) target.classList.add('active');
  if (navItem) navItem.classList.add('active');

  // Lazy-render charts
  if (section === 'statistics') renderStatistics();
  if (section === 'dashboard') updateDashboard();
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

document.getElementById('mobileMenuBtn').addEventListener('click', openSidebar);
overlay.addEventListener('click', closeSidebar);

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('open');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function setupTopbar() {
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    searchClear.classList.toggle('visible', searchQuery.length > 0);
    renderTasksGrid();
    // Auto-navigate to tasks if there's a query
    if (searchQuery) navigateTo('tasks');
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.remove('visible');
    renderTasksGrid();
  });

  // Notification button
  const notifBtn = document.getElementById('notifBtn');
  notifBtn.addEventListener('click', toggleNotifications);

  // Add task button
  document.getElementById('addTaskBtn').addEventListener('click', () => openModal());
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function toggleNotifications() {
  if (!('Notification' in window)) {
    showToast('Browser does not support notifications.', 'error');
    return;
  }
  if (settings.notifications) {
    settings.notifications = false;
    document.getElementById('notifBtn').classList.remove('active');
    document.getElementById('notifToggle').checked = false;
    saveSettings();
    showToast('Notifications disabled', 'info');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    settings.notifications = true;
    document.getElementById('notifBtn').classList.add('active');
    document.getElementById('notifToggle').checked = true;
    saveSettings();
    showToast('Notifications enabled! 🔔', 'success');
    new Notification('DayFlow', { body: 'You will now receive task reminders!', icon: '' });
  } else {
    showToast('Permission denied for notifications.', 'error');
  }
}

function scheduleNotifications() {
  if (!settings.notifications || Notification.permission !== 'granted') return;
  const now = today();
  tasks.forEach(task => {
    if (!task.completed && task.dueDate === now) {
      const lastNotif = task._lastNotif;
      const todayKey = now;
      if (lastNotif !== todayKey) {
        task._lastNotif = todayKey;
        new Notification(`📌 Task Due Today: ${task.title}`, {
          body: task.description || `Priority: ${task.priority}`,
        });
        saveTasks();
      }
    }
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
const taskModalOverlay = document.getElementById('taskModalOverlay');
const taskForm = document.getElementById('taskForm');

function setupModal() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  taskModalOverlay.addEventListener('click', e => { if (e.target === taskModalOverlay) closeModal(); });
  taskForm.addEventListener('submit', saveTask);
}

function openModal(task = null) {
  taskForm.reset();
  document.getElementById('taskId').value = task ? task.id : '';
  document.getElementById('modalTitle').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('modalSave').textContent = task ? 'Update Task' : 'Save Task';

  if (task) {
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDesc').value = task.description || '';
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskCategory').value = task.category;
  } else {
    document.getElementById('taskPriority').value = 'medium';
    document.getElementById('taskDueDate').value = today();
  }

  taskModalOverlay.classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeModal() {
  taskModalOverlay.classList.remove('open');
}

function saveTask(e) {
  e.preventDefault();
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) {
    showToast('Please enter a task title.', 'warning');
    document.getElementById('taskTitle').focus();
    return;
  }

  const id = document.getElementById('taskId').value;
  const taskData = {
    title,
    description: document.getElementById('taskDesc').value.trim(),
    dueDate: document.getElementById('taskDueDate').value,
    priority: document.getElementById('taskPriority').value,
    category: document.getElementById('taskCategory').value,
  };

  if (id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], ...taskData };
      showToast('Task updated!', 'success');
    }
  } else {
    tasks.unshift({
      id: genId(),
      completed: false,
      createdAt: new Date().toISOString(),
      ...taskData,
    });
    showToast('Task added! 🎉', 'success');
  }

  saveTasks();
  closeModal();
  updateDashboard();
  renderTasksGrid();
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
let confirmCallback = null;

const confirmOverlay = document.getElementById('confirmOverlay');

function setupConfirmDialog() {
  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirm(); });
  document.getElementById('confirmOk').addEventListener('click', () => {
    if (typeof confirmCallback === 'function') confirmCallback();
    closeConfirm();
  });
}

function openConfirm({ title, msg, icon = '⚠️', okLabel = 'Delete', callback }) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmOk').textContent = okLabel;
  confirmCallback = callback;
  confirmOverlay.classList.add('open');
}

function closeConfirm() {
  confirmOverlay.classList.remove('open');
  confirmCallback = null;
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────
function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  openConfirm({
    title: 'Delete Task',
    msg: `"${task.title}" will be permanently deleted.`,
    okLabel: 'Delete',
    callback: () => {
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      updateDashboard();
      renderTasksGrid();
      showToast('Task deleted.', 'info');
    }
  });
}

function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  updateDashboard();
  renderTasksGrid();
  showToast(task.completed ? '✅ Task completed!' : 'Task marked incomplete.', task.completed ? 'success' : 'info');
}

// ─── Filter helpers ────────────────────────────────────────────────────────────
function getFilteredTasks() {
  return tasks.filter(task => {
    const matchStatus =
      currentFilter === 'all' ||
      (currentFilter === 'completed' && task.completed) ||
      (currentFilter === 'pending' && !task.completed);

    const matchPriority =
      currentPriorityFilter === 'all' || task.priority === currentPriorityFilter;

    const matchCategory =
      currentCategoryFilter === 'all' || task.category === currentCategoryFilter;

    const matchSearch =
      !searchQuery ||
      task.title.toLowerCase().includes(searchQuery) ||
      (task.description || '').toLowerCase().includes(searchQuery);

    return matchStatus && matchPriority && matchCategory && matchSearch;
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function updateDashboard() {
  // Greeting
  const name = settings.displayName || 'User';
  document.getElementById('greetingMsg').textContent = `${getGreeting()}, ${name}! 👋`;
  document.getElementById('userAvatar').textContent = name[0].toUpperCase();
  document.getElementById('userName').textContent = name;

  // Date badge
  const now = new Date();
  document.getElementById('dateBadge').textContent = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  // Counts
  const total = tasks.length;
  const done = tasks.filter(t => t.completed).length;
  const pending = tasks.filter(t => !t.completed).length;
  const overdue = tasks.filter(t => !t.completed && isOverdue(t.dueDate)).length;

  animateCount('totalCount', total);
  animateCount('doneCount', done);
  animateCount('pendingCount', pending);
  animateCount('overdueCount', overdue);

  // Progress
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  document.getElementById('progressPct').textContent = `${pct}%`;
  document.getElementById('progressBar').style.width = `${pct}%`;
  document.getElementById('progressSub').textContent =
    pct === 100 ? '🎉 Amazing! All tasks completed!' :
    pct >= 75  ? '🔥 Fantastic progress! Almost done!' :
    pct >= 50  ? '💪 Keep it up! Over halfway there.' :
    pct > 0    ? '🚀 Good start! Keep the momentum.' :
                 'Start by completing a task to see your progress!';

  // Recent tasks
  renderRecentTasks();

  // Priority chart
  renderPriorityChart();

  // Stats summary
  updateStatsSummaryValues();
}

function animateCount(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  const step = target > current ? 1 : -1;
  const steps = Math.abs(target - current);
  const delay = Math.max(20, Math.floor(600 / steps));
  let val = current;
  const timer = setInterval(() => {
    val += step;
    el.textContent = val;
    if (val === target) clearInterval(timer);
  }, delay);
}

function renderRecentTasks() {
  const container = document.getElementById('recentTasksList');
  const recent = [...tasks].slice(0, 5);
  if (!recent.length) {
    container.innerHTML = '<div class="empty-state small">No tasks yet. Create one!</div>';
    return;
  }
  container.innerHTML = recent.map(task => {
    const badgeClass = task.priority;
    return `
      <div class="recent-task-item">
        <div class="recent-task-check ${task.completed ? 'done' : ''}" onclick="toggleComplete('${task.id}')">
          ${task.completed ? '✓' : ''}
        </div>
        <span class="recent-task-text ${task.completed ? 'done' : ''}">${escHtml(task.title)}</span>
        <span class="recent-task-badge priority-badge ${badgeClass}">${task.priority}</span>
      </div>
    `;
  }).join('');
}

function renderPriorityChart() {
  const high = tasks.filter(t => t.priority === 'high').length;
  const medium = tasks.filter(t => t.priority === 'medium').length;
  const low = tasks.filter(t => t.priority === 'low').length;

  const canvas = document.getElementById('priorityChart');
  if (!canvas) return;

  if (priorityChartInst) { priorityChartInst.destroy(); priorityChartInst = null; }

  const total = high + medium + low;
  if (total === 0) {
    canvas.parentElement.innerHTML = '<div class="empty-state small" style="padding:16px">No tasks yet</div>';
    return;
  }

  const isDark = settings.darkMode;
  priorityChartInst = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        data: [high, medium, low],
        backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } },
      },
    },
  });

  // Legend
  const legend = document.getElementById('priorityLegend');
  if (legend) {
    legend.innerHTML = [
      { label: 'High', color: '#ef4444', count: high },
      { label: 'Medium', color: '#f59e0b', count: medium },
      { label: 'Low', color: '#10b981', count: low },
    ].map(l => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${l.color}"></span>
        <span>${l.label}</span>
        <span style="margin-left:auto;font-weight:700">${l.count}</span>
      </div>
    `).join('');
  }
}

// ─── Tasks Grid ───────────────────────────────────────────────────────────────
function setupTasksFilters() {
  // status filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTasksGrid();
    });
  });

  document.getElementById('priorityFilter').addEventListener('change', e => {
    currentPriorityFilter = e.target.value;
    renderTasksGrid();
  });

  document.getElementById('categoryFilter').addEventListener('change', e => {
    currentCategoryFilter = e.target.value;
    renderTasksGrid();
  });
}

// Call once
setupTasksFilters();

function renderTasksGrid() {
  const grid = document.getElementById('tasksGrid');
  const filtered = getFilteredTasks();

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state" id="emptyTasksState">
        <div class="empty-icon">🗒️</div>
        <h3>${searchQuery ? 'No results found' : 'No tasks here'}</h3>
        <p>${searchQuery ? `No tasks match "${searchQuery}"` : 'Click "+ New Task" to get started'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((task, i) => buildTaskCard(task, i)).join('');

  // Bind events
  grid.querySelectorAll('.complete-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleComplete(btn.dataset.id));
  });

  grid.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = tasks.find(t => t.id === btn.dataset.id);
      if (task) openModal(task);
    });
  });

  grid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTask(btn.dataset.id));
  });

  attachDragDropListeners();
}

function buildTaskCard(task, idx) {
  const overdue = !task.completed && isOverdue(task.dueDate);
  const catEmoji = { work: '💼', study: '📚', personal: '🏠' }[task.category] || '';
  return `
    <div class="task-card ${task.completed ? 'completed-card' : ''}" 
         data-id="${task.id}" 
         data-index="${idx}" 
         draggable="true"
         style="opacity:${task.completed ? '.75' : '1'}">
      <div class="priority-strip ${task.priority}"></div>
      <div class="task-card-top">
        <div class="task-card-meta">
          <span class="priority-badge ${task.priority}">${task.priority}</span>
          <span class="cat-badge ${task.category}">${catEmoji} ${task.category}</span>
        </div>
        <div class="task-title ${task.completed ? 'completed' : ''}">${escHtml(task.title)}</div>
        ${task.description ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
        ${task.dueDate ? `
          <div class="task-due ${overdue ? 'overdue' : ''}">
            📅 ${overdue ? '⚠️ Overdue · ' : ''}${formatDate(task.dueDate)}
          </div>` : ''}
      </div>
      <div class="task-card-bottom">
        <div class="task-actions">
          <button class="task-action-btn complete-btn ${task.completed ? 'done' : ''}" data-id="${task.id}">
            ${task.completed ? '↩ Undo' : '✓ Done'}
          </button>
          <button class="task-action-btn edit-btn" data-id="${task.id}">✏️ Edit</button>
        </div>
        <button class="task-action-btn delete-btn" data-id="${task.id}">🗑️</button>
      </div>
    </div>`;
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
function setupDragAndDrop() { /* listeners added per-render */ }

function attachDragDropListeners() {
  const cards = document.querySelectorAll('.task-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragover', onDragOver);
    card.addEventListener('dragleave', onDragLeave);
    card.addEventListener('drop', onDrop);
    card.addEventListener('dragend', onDragEnd);
  });
}

function onDragStart(e) {
  dragSrcIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const targetIndex = parseInt(e.currentTarget.dataset.index);
  e.currentTarget.classList.remove('drag-over');
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

  const filtered = getFilteredTasks();
  const srcTask = filtered[dragSrcIndex];
  const tgtTask = filtered[targetIndex];

  const srcRealIdx = tasks.indexOf(srcTask);
  const tgtRealIdx = tasks.indexOf(tgtTask);

  if (srcRealIdx === -1 || tgtRealIdx === -1) return;
  tasks.splice(srcRealIdx, 1);
  tasks.splice(tgtRealIdx, 0, srcTask);
  saveTasks();
  renderTasksGrid();
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging', 'drag-over');
  dragSrcIndex = null;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function setupCalendar() {
  document.getElementById('prevMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  document.getElementById('calMonthTitle').textContent =
    new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today();

  // Build grid
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    grid.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayTasks = tasks.filter(t => t.dueDate === dateStr);
    const isToday = dateStr === todayStr;
    const isSelected = calendarSelectedDate === dateStr;

    const el = document.createElement('div');
    el.className = `cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${dayTasks.length ? ' has-tasks' : ''}`;
    el.textContent = d;
    el.dataset.date = dateStr;

    el.addEventListener('click', () => {
      calendarSelectedDate = dateStr;
      renderCalendar();
      renderCalendarTasks(dateStr);
    });

    grid.appendChild(el);
  }
}

function renderCalendarTasks(dateStr) {
  document.getElementById('calSelectedDate').textContent = formatDate(dateStr);
  const container = document.getElementById('calTasksList');
  const dayTasks = tasks.filter(t => t.dueDate === dateStr);

  if (!dayTasks.length) {
    container.innerHTML = '<div class="empty-state small">No tasks on this day.</div>';
    return;
  }

  container.innerHTML = dayTasks.map(task => `
    <div class="cal-task-mini ${task.priority}">
      <div class="cal-task-mini-title">${escHtml(task.title)}</div>
      <div class="cal-task-mini-meta">${priorityLabel(task.priority)} · ${categoryLabel(task.category)}${task.completed ? ' · ✅ Done' : ''}</div>
    </div>
  `).join('');
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function renderStatistics() {
  updateStatsSummaryValues();
  renderCompletionChart();
  renderCategoryChart();
  renderWeeklyChart();
}

function updateStatsSummaryValues() {
  const done = tasks.filter(t => t.completed).length;
  const total = tasks.length;
  const rate = total === 0 ? 0 : Math.round((done / total) * 100);
  const highDone = tasks.filter(t => t.completed && t.priority === 'high').length;

  document.getElementById('sCompleted').textContent = done;
  document.getElementById('sRate').textContent = `${rate}%`;
  document.getElementById('sStreak').textContent = calculateStreak();
  document.getElementById('sHighPriority').textContent = highDone;
}

function calculateStreak() {
  // Count consecutive days with at least one task completed
  const completedDates = new Set(
    tasks.filter(t => t.completed && t.dueDate).map(t => t.dueDate)
  );
  let streak = 0;
  let d = new Date();
  while (true) {
    const s = d.toISOString().slice(0, 10);
    if (completedDates.has(s)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function renderCompletionChart() {
  const canvas = document.getElementById('completionChart');
  if (!canvas) return;
  if (completionChartInst) { completionChartInst.destroy(); completionChartInst = null; }

  const done = tasks.filter(t => t.completed).length;
  const pending = tasks.filter(t => !t.completed).length;

  completionChartInst = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Pending'],
      datasets: [{
        data: [done || 0, pending || 1],
        backgroundColor: ['#10b981', '#e5e7eb'],
        hoverOffset: 8,
        borderWidth: 0,
      }],
    },
    options: {
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, font: { family: 'Inter' } } },
      },
    },
  });
}

function renderCategoryChart() {
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;
  if (categoryChartInst) { categoryChartInst.destroy(); categoryChartInst = null; }

  const work = tasks.filter(t => t.category === 'work').length;
  const study = tasks.filter(t => t.category === 'study').length;
  const personal = tasks.filter(t => t.category === 'personal').length;

  categoryChartInst = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: ['💼 Work', '📚 Study', '🏠 Personal'],
      datasets: [{
        data: [work || 0, study || 0, personal || 0],
        backgroundColor: ['#3b82f6', '#8b5cf6', '#f97316'],
        borderWidth: 0,
        hoverOffset: 8,
      }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14, font: { family: 'Inter' } } },
      },
    },
  });
}

function renderWeeklyChart() {
  const canvas = document.getElementById('weeklyChart');
  if (!canvas) return;
  if (weeklyChartInst) { weeklyChartInst.destroy(); weeklyChartInst = null; }

  // Build last 7 days
  const days = [];
  const labels = [];
  const completedCounts = [];
  const addedCounts = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const s = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    labels.push(label);
    completedCounts.push(tasks.filter(t => t.completed && t.dueDate === s).length);
    addedCounts.push(tasks.filter(t => t.createdAt && t.createdAt.slice(0, 10) === s).length);
  }

  weeklyChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Tasks Added',
          data: addedCounts,
          backgroundColor: 'rgba(124,58,237,.2)',
          borderColor: 'rgba(124,58,237,1)',
          borderWidth: 2,
          borderRadius: 8,
        },
        {
          label: 'Tasks Completed',
          data: completedCounts,
          backgroundColor: 'rgba(16,185,129,.2)',
          borderColor: 'rgba(16,185,129,1)',
          borderWidth: 2,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16, font: { family: 'Inter' } } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter' } } },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { family: 'Inter' } },
          grid: { color: 'rgba(0,0,0,.05)' },
        },
      },
    },
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function setupSettings() {
  // Dark mode
  const dmToggle = document.getElementById('darkModeToggle');
  dmToggle.checked = settings.darkMode;
  dmToggle.addEventListener('change', () => {
    settings.darkMode = dmToggle.checked;
    applySettings();
    saveSettings();
  });

  // Notification toggle in settings
  const notifToggle = document.getElementById('notifToggle');
  notifToggle.checked = settings.notifications;
  notifToggle.addEventListener('change', () => toggleNotifications());

  // Color swatches
  document.querySelectorAll('.swatch').forEach(sw => {
    if (sw.dataset.color === settings.accent) sw.classList.add('active');
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      settings.accent = sw.dataset.color;
      applySettings();
      saveSettings();
    });
  });

  // Display name
  const nameInput = document.getElementById('displayNameInput');
  nameInput.value = settings.displayName;
  document.getElementById('saveNameBtn').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { showToast('Please enter a name.', 'warning'); return; }
    settings.displayName = name;
    saveSettings();
    updateDashboard();
    showToast('Name saved! 👋', 'success');
  });

  // Clear all
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    openConfirm({
      title: 'Clear All Tasks',
      msg: 'All tasks will be permanently deleted. This cannot be undone.',
      icon: '🗑️',
      okLabel: 'Clear All',
      callback: () => {
        tasks = [];
        saveTasks();
        updateDashboard();
        renderTasksGrid();
        showToast('All tasks cleared.', 'info');
      }
    });
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayflow-tasks-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Tasks exported! 📥', 'success');
  });
}

function applySettings() {
  const html = document.documentElement;
  html.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  html.setAttribute('data-accent', settings.accent || 'violet');

  // Sync toggles
  const dmToggle = document.getElementById('darkModeToggle');
  if (dmToggle) dmToggle.checked = settings.darkMode;

  const notifBtn = document.getElementById('notifBtn');
  if (notifBtn) notifBtn.classList.toggle('active', settings.notifications);

  // Sync swatches
  document.querySelectorAll('.swatch').forEach(sw => {
    sw.classList.toggle('active', sw.dataset.color === settings.accent);
  });

  // Name
  const nameInput = document.getElementById('displayNameInput');
  if (nameInput) nameInput.value = settings.displayName;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}
