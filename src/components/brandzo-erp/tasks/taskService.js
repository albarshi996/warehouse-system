/**
 * Task Management Service
 * Handles localStorage CRUD operations for Brandzo Task Module
 * Storage Key: BrandzoTasks
 */

const STORAGE_KEY = 'BrandzoTasks';

/**
 * Get all tasks from localStorage, ordered by createdAt descending
 * @returns {Array} Array of task objects
 */
export function getAllTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const tasks = stored ? JSON.parse(stored) : [];
    // Sort by createdAt descending (newest first)
    return tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.error('Error reading tasks from localStorage:', err);
    return [];
  }
}

/**
 * Add a new task to localStorage
 * Automatically adds createdAt and updatedAt timestamps
 * @param {Object} data - Task data without timestamps
 * @returns {Object} The saved task with id and timestamps
 */
export function addTask(data) {
  try {
    const tasks = getAllTasks();
    const now = new Date().toISOString();
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newTask = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
      sent: false,
      sentAt: null,
      emailSent: false,
      emailSentAt: null,
      done: false,
      doneAt: null,
    };
    
    tasks.unshift(newTask); // Add to beginning (newest first)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return newTask;
  } catch (err) {
    console.error('Error adding task to localStorage:', err);
    throw err;
  }
}

/**
 * Update an existing task in localStorage
 * Automatically updates the updatedAt timestamp
 * @param {string} id - Task ID
 * @param {Object} data - Partial or complete task data to update
 * @returns {Object} The updated task
 */
export function updateTask(id, data) {
  try {
    const tasks = getAllTasks();
    const index = tasks.findIndex((t) => t.id === id);
    
    if (index === -1) {
      throw new Error(`Task with id ${id} not found`);
    }
    
    const now = new Date().toISOString();
    tasks[index] = {
      ...tasks[index],
      ...data,
      updatedAt: now,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return tasks[index];
  } catch (err) {
    console.error('Error updating task in localStorage:', err);
    throw err;
  }
}

/**
 * Delete a task from localStorage by ID
 * @param {string} id - Task ID
 * @returns {boolean} True if deleted, false if not found
 */
export function deleteTask(id) {
  try {
    const tasks = getAllTasks();
    const filteredTasks = tasks.filter((t) => t.id !== id);
    
    if (filteredTasks.length === tasks.length) {
      console.warn(`Task with id ${id} not found for deletion`);
      return false;
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredTasks));
    return true;
  } catch (err) {
    console.error('Error deleting task from localStorage:', err);
    throw err;
  }
}

/**
 * Mark a task as sent via WhatsApp
 * Updates sent: true and sets sentAt timestamp
 * @param {string} id - Task ID
 * @returns {Object} The updated task
 */
export function markSent(id) {
  try {
    return updateTask(id, {
      sent: true,
      sentAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error marking task as sent:', err);
    throw err;
  }
}

/**
 * Mark a task as sent via Email
 * Updates emailSent: true and sets emailSentAt timestamp
 * @param {string} id - Task ID
 * @returns {Object} The updated task
 */
export function markEmailSent(id) {
  try {
    return updateTask(id, {
      emailSent: true,
      emailSentAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error marking task as email sent:', err);
    throw err;
  }
}

/**
 * Mark a task as done
 * Updates done: true and sets doneAt timestamp
 * @param {string} id - Task ID
 * @returns {Object} The updated task
 */
export function markDone(id) {
  try {
    return updateTask(id, {
      done: true,
      doneAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error marking task as done:', err);
    throw err;
  }
}

/**
 * Reopen a task (mark as not done)
 * Updates done: false and clears doneAt
 * @param {string} id - Task ID
 * @returns {Object} The updated task
 */
export function markUndone(id) {
  try {
    return updateTask(id, {
      done: false,
      doneAt: null,
    });
  } catch (err) {
    console.error('Error reopening task:', err);
    throw err;
  }
}

/**
 * Export all tasks (for JSON backup download)
 * @returns {Array} Array of all task objects
 */
export function exportTasks() {
  return getAllTasks();
}

/**
 * Import tasks from a backup and merge by id:
 * existing ids are updated, new ids are appended.
 * @param {Array} incoming - Array of task objects (parsed JSON backup)
 * @returns {{added: number, updated: number, total: number}} Merge counts
 */
export function importTasks(incoming) {
  if (!Array.isArray(incoming)) {
    throw new Error('Invalid import payload: expected an array of tasks');
  }

  const tasks = getAllTasks();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;

  incoming.forEach((item) => {
    if (!item || typeof item !== 'object' || !item.title) {
      return; // skip malformed entries
    }

    if (item.id && byId.has(item.id)) {
      byId.set(item.id, {
        ...byId.get(item.id),
        ...item,
        updatedAt: now,
      });
      updated += 1;
    } else {
      const id = item.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      byId.set(id, {
        createdAt: now,
        sent: false,
        sentAt: null,
        emailSent: false,
        emailSentAt: null,
        done: false,
        doneAt: null,
        ...item,
        id,
        updatedAt: now,
      });
      added += 1;
    }
  });

  const merged = Array.from(byId.values());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return { added, updated, total: merged.length };
}