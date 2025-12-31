// State
let courses = [];
let deleteCallback = null;

// Initialize
async function init() {
  // Require admin access
  await updateNavbar();
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/signin';
    return;
  }
  if (user.role !== 'admin') {
    alert('Admin access required');
    window.location.href = '/';
    return;
  }

  await loadCourses();
}

// Load all courses
async function loadCourses() {
  try {
    const response = await fetch('/api/courses');
    courses = await response.json();
    renderCourses();
  } catch (error) {
    console.error('Failed to load courses:', error);
    document.getElementById('courses-container').innerHTML = `
      <div class="alert alert-danger">Failed to load courses</div>
    `;
  }
}

// Render courses list
function renderCourses() {
  const container = document.getElementById('courses-container');

  if (courses.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5">
        <p class="text-muted">No courses yet. Click "Add Course" to create your first course.</p>
      </div>
    `;
    return;
  }

  const html = courses.map(course => {
    const isDisabled = course.enabled === false;
    return `
    <div class="card mb-4 ${isDisabled ? 'border-secondary opacity-75' : ''}" id="course-${course.id}">
      <div class="card-header d-flex justify-content-between align-items-center ${isDisabled ? 'bg-secondary bg-opacity-10' : ''}">
        <div>
          <h5 class="mb-0">
            ${escapeHtml(course.name)}
            ${isDisabled ? '<span class="badge bg-secondary ms-2">Disabled</span>' : ''}
          </h5>
          ${course.description ? `<small class="text-muted">${escapeHtml(course.description)}</small>` : ''}
        </div>
        <div>
          ${isDisabled
            ? `<button class="btn btn-sm btn-success me-1" onclick="toggleCourseEnabled('${course.id}', true)">Enable</button>`
            : `<button class="btn btn-sm btn-outline-warning me-1" onclick="toggleCourseEnabled('${course.id}', false)">Disable</button>`
          }
          <button class="btn btn-sm btn-outline-primary me-1" onclick="openTopicModal('${course.id}')">
            + Add Topic
          </button>
          <button class="btn btn-sm btn-outline-info me-1" onclick="openImportModal('${course.id}')">
            Import JSON
          </button>
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="openCourseModal('${course.id}')">
            Edit
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteCourse('${course.id}', '${escapeHtml(course.name)}')">
            Delete
          </button>
        </div>
      </div>
      <div class="card-body">
        ${course.topics.length === 0 ? `
          <p class="text-muted mb-0">No topics yet. Add topics to start practicing.</p>
        ` : `
          <div class="table-responsive">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Subtopics</th>
                  <th style="width: 150px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${course.topics.map(topic => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(topic.name)}</strong>
                      ${topic.description ? `<br><small class="text-muted">${escapeHtml(topic.description)}</small>` : ''}
                    </td>
                    <td>
                      ${topic.subtopics && topic.subtopics.length > 0
                        ? topic.subtopics.map(s => `<span class="badge bg-light text-dark me-1">${escapeHtml(s)}</span>`).join('')
                        : '<span class="text-muted">No subtopics</span>'
                      }
                    </td>
                    <td>
                      <button class="btn btn-sm btn-outline-secondary me-1" onclick="openTopicModal('${course.id}', '${topic.id}')">
                        Edit
                      </button>
                      <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteTopic('${course.id}', '${topic.id}', '${escapeHtml(topic.name)}')">
                        Delete
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;
  }).join('');

  container.innerHTML = html;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== COURSE FUNCTIONS ====================

function openCourseModal(courseId = null) {
  const modal = document.getElementById('courseModal');
  const title = document.getElementById('courseModalTitle');
  const idInput = document.getElementById('course-id');
  const nameInput = document.getElementById('course-name');
  const descInput = document.getElementById('course-description');

  if (courseId) {
    // Edit mode
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    title.textContent = 'Edit Course';
    idInput.value = courseId;
    nameInput.value = course.name;
    descInput.value = course.description || '';

    // Show modal programmatically for edit
    new bootstrap.Modal(modal).show();
  } else {
    // Add mode - modal is shown via data-bs-toggle
    title.textContent = 'Add Course';
    idInput.value = '';
    nameInput.value = '';
    descInput.value = '';
  }
}

async function saveCourse() {
  const idInput = document.getElementById('course-id');
  const nameInput = document.getElementById('course-name');
  const descInput = document.getElementById('course-description');

  const name = nameInput.value.trim();
  const description = descInput.value.trim();

  if (!name) {
    alert('Course name is required');
    return;
  }

  try {
    let response;
    if (idInput.value) {
      // Update existing course
      response = await fetch(`/api/courses/${idInput.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
    } else {
      // Create new course
      response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    // Close modal and reload
    bootstrap.Modal.getInstance(document.getElementById('courseModal')).hide();
    await loadCourses();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

async function confirmDeleteCourse(courseId, courseName) {
  // First check if course has learner activity
  try {
    const response = await fetch(`/api/courses/${courseId}/activity`);
    const activity = await response.json();

    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    const messageEl = document.getElementById('delete-message');
    const confirmBtn = document.getElementById('confirm-delete-btn');
    const disableBtn = document.getElementById('disable-instead-btn');

    if (activity.hasActivity) {
      // Show warning about learner activity
      messageEl.innerHTML = `
        <div class="alert alert-warning mb-3">
          <strong>Warning:</strong> This course has learner activity!
        </div>
        <p>The course "<strong>${escapeHtml(courseName)}</strong>" has:</p>
        <ul>
          <li><strong>${activity.uniqueUsers}</strong> learner(s) with activity</li>
          <li><strong>${activity.performanceCount}</strong> practice records</li>
          <li><strong>${activity.historyCount}</strong> question history entries</li>
          <li><strong>${activity.interviewCount}</strong> interview sessions</li>
        </ul>
        <p class="text-danger mb-0">Deleting this course will <strong>permanently remove all learner data</strong>. Consider disabling it instead to preserve learner progress.</p>
      `;

      // Show the disable button
      if (disableBtn) {
        disableBtn.style.display = 'inline-block';
        disableBtn.onclick = async () => {
          await toggleCourseEnabled(courseId, false);
          modal.hide();
        };
      }

      confirmBtn.textContent = 'Delete Anyway';
      confirmBtn.className = 'btn btn-danger';
    } else {
      messageEl.textContent = `Are you sure you want to delete the course "${courseName}" and all its topics?`;
      if (disableBtn) {
        disableBtn.style.display = 'none';
      }
      confirmBtn.textContent = 'Delete';
      confirmBtn.className = 'btn btn-danger';
    }

    deleteCallback = async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error);
        }
        modal.hide();
        await loadCourses();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    };

    confirmBtn.onclick = deleteCallback;
    modal.show();
  } catch (error) {
    console.error('Error checking course activity:', error);
    // Fallback to simple confirmation if activity check fails
    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    document.getElementById('delete-message').textContent =
      `Are you sure you want to delete the course "${courseName}" and all its topics?`;

    deleteCallback = async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error);
        }
        modal.hide();
        await loadCourses();
      } catch (error) {
        alert('Error: ' + error.message);
      }
    };

    document.getElementById('confirm-delete-btn').onclick = deleteCallback;
    modal.show();
  }
}

// Toggle course enabled/disabled
async function toggleCourseEnabled(courseId, enabled) {
  try {
    const response = await fetch(`/api/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    await loadCourses();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ==================== TOPIC FUNCTIONS ====================

function openTopicModal(courseId, topicId = null) {
  const modal = document.getElementById('topicModal');
  const title = document.getElementById('topicModalTitle');
  const courseIdInput = document.getElementById('topic-course-id');
  const idInput = document.getElementById('topic-id');
  const nameInput = document.getElementById('topic-name');
  const descInput = document.getElementById('topic-description');
  const subtopicsInput = document.getElementById('topic-subtopics');

  courseIdInput.value = courseId;

  if (topicId) {
    // Edit mode
    const course = courses.find(c => c.id === courseId);
    const topic = course?.topics.find(t => t.id === topicId);
    if (!topic) return;

    title.textContent = 'Edit Topic';
    idInput.value = topicId;
    nameInput.value = topic.name;
    descInput.value = topic.description || '';
    subtopicsInput.value = (topic.subtopics || []).join('\n');
  } else {
    // Add mode
    title.textContent = 'Add Topic';
    idInput.value = '';
    nameInput.value = '';
    descInput.value = '';
    subtopicsInput.value = '';
  }

  new bootstrap.Modal(modal).show();
}

async function saveTopic() {
  const courseIdInput = document.getElementById('topic-course-id');
  const idInput = document.getElementById('topic-id');
  const nameInput = document.getElementById('topic-name');
  const descInput = document.getElementById('topic-description');
  const subtopicsInput = document.getElementById('topic-subtopics');

  const courseId = courseIdInput.value;
  const name = nameInput.value.trim();
  const description = descInput.value.trim();
  const subtopics = subtopicsInput.value
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (!name) {
    alert('Topic name is required');
    return;
  }

  try {
    let response;
    if (idInput.value) {
      // Update existing topic
      response = await fetch(`/api/courses/${courseId}/topics/${idInput.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, subtopics })
      });
    } else {
      // Create new topic
      response = await fetch(`/api/courses/${courseId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, subtopics })
      });
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    // Close modal and reload
    bootstrap.Modal.getInstance(document.getElementById('topicModal')).hide();
    await loadCourses();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

function confirmDeleteTopic(courseId, topicId, topicName) {
  const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
  document.getElementById('delete-message').textContent =
    `Are you sure you want to delete the topic "${topicName}"?`;

  deleteCallback = async () => {
    try {
      const response = await fetch(`/api/courses/${courseId}/topics/${topicId}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }
      modal.hide();
      await loadCourses();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  document.getElementById('confirm-delete-btn').onclick = deleteCallback;
  modal.show();
}

// ==================== IMPORT FUNCTIONS ====================

let parsedTopics = [];

function openImportModal(courseId) {
  const modal = document.getElementById('importModal');
  document.getElementById('import-course-id').value = courseId;

  // Reset the modal
  document.getElementById('topics-json').value = '';
  document.getElementById('json-file-input').value = '';
  document.getElementById('file-content-preview').style.display = 'none';
  document.getElementById('import-validation').style.display = 'none';
  document.getElementById('validation-error').style.display = 'none';
  document.getElementById('validation-success').style.display = 'none';
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-btn').disabled = true;
  parsedTopics = [];

  // Reset to first tab
  const firstTab = new bootstrap.Tab(document.getElementById('json-textarea-tab'));
  firstTab.show();

  new bootstrap.Modal(modal).show();
}

// Handle file upload
document.addEventListener('DOMContentLoaded', function() {
  const fileInput = document.getElementById('json-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }
});

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const content = e.target.result;
    document.getElementById('file-preview-text').textContent = content;
    document.getElementById('file-content-preview').style.display = 'block';

    // Also populate the textarea for validation
    document.getElementById('topics-json').value = content;
  };
  reader.onerror = function() {
    alert('Error reading file');
  };
  reader.readAsText(file);
}

function getJsonContent() {
  // Get content from textarea (which is also populated by file upload)
  return document.getElementById('topics-json').value.trim();
}

function validateImportJson() {
  const jsonContent = getJsonContent();

  const validationDiv = document.getElementById('import-validation');
  const errorDiv = document.getElementById('validation-error');
  const successDiv = document.getElementById('validation-success');
  const previewDiv = document.getElementById('import-preview');
  const importBtn = document.getElementById('import-btn');

  validationDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  successDiv.style.display = 'none';
  previewDiv.style.display = 'none';
  importBtn.disabled = true;
  parsedTopics = [];

  if (!jsonContent) {
    errorDiv.textContent = 'Please enter or upload JSON content';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const parsed = JSON.parse(jsonContent);

    // Validate structure
    if (!Array.isArray(parsed)) {
      throw new Error('JSON must be an array of topic objects');
    }

    if (parsed.length === 0) {
      throw new Error('Array is empty. Please provide at least one topic');
    }

    // Validate each topic
    const errors = [];
    parsed.forEach((topic, index) => {
      if (!topic.name || typeof topic.name !== 'string' || !topic.name.trim()) {
        errors.push(`Topic ${index + 1}: "name" is required and must be a non-empty string`);
      }
      if (topic.description !== undefined && typeof topic.description !== 'string') {
        errors.push(`Topic ${index + 1}: "description" must be a string`);
      }
      if (topic.subtopics !== undefined) {
        if (!Array.isArray(topic.subtopics)) {
          errors.push(`Topic ${index + 1}: "subtopics" must be an array`);
        } else if (!topic.subtopics.every(s => typeof s === 'string')) {
          errors.push(`Topic ${index + 1}: all subtopics must be strings`);
        }
      }
    });

    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    // Validation passed
    parsedTopics = parsed.map(t => ({
      name: t.name.trim(),
      description: t.description?.trim() || '',
      subtopics: (t.subtopics || []).map(s => s.trim()).filter(s => s)
    }));

    // Show success
    document.getElementById('topics-count').textContent = parsedTopics.length;
    successDiv.style.display = 'block';

    // Show preview
    const previewBody = document.getElementById('preview-body');
    previewBody.innerHTML = parsedTopics.map(topic => `
      <tr>
        <td><strong>${escapeHtml(topic.name)}</strong></td>
        <td>${topic.description ? escapeHtml(topic.description) : '<span class="text-muted">-</span>'}</td>
        <td>${topic.subtopics.length > 0
          ? topic.subtopics.map(s => `<span class="badge bg-light text-dark me-1">${escapeHtml(s)}</span>`).join('')
          : '<span class="text-muted">-</span>'
        }</td>
      </tr>
    `).join('');
    previewDiv.style.display = 'block';

    // Enable import button
    importBtn.disabled = false;

  } catch (error) {
    errorDiv.innerHTML = error.message.replace(/\n/g, '<br>');
    errorDiv.style.display = 'block';
  }
}

async function importTopics() {
  if (parsedTopics.length === 0) {
    alert('No valid topics to import. Please validate the JSON first.');
    return;
  }

  const courseId = document.getElementById('import-course-id').value;
  const importBtn = document.getElementById('import-btn');

  importBtn.disabled = true;
  importBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importing...';

  try {
    const response = await fetch(`/api/courses/${courseId}/topics/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topics: parsedTopics })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const result = await response.json();

    // Close modal and reload
    bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
    await loadCourses();

    alert(`Successfully imported ${result.imported} topics!`);

  } catch (error) {
    alert('Error importing topics: ' + error.message);
    importBtn.disabled = false;
    importBtn.innerHTML = 'Import Topics';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
