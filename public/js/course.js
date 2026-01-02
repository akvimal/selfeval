// ============================================================
// COURSE PAGE - Consolidated JS for all tabs
// ============================================================

// Global State
let courseId = null;
let course = null;
let currentQuestion = null;
let performanceData = null;
let historyData = [];
let topicChart = null;
let typeChart = null;
let interviewSession = null;
let interviewMessages = [];
let personas = [];
let roles = { genericRoles: [], courseRoles: [] };
let currentInterviewContext = { persona: null, targetRole: null, difficultyLevel: 2, currentTopic: null };
let interviewTimer = null;
let interviewStartTime = null;

// Type labels
const TYPE_LABELS = {
  mcq: 'Multiple Choice',
  truefalse: 'True/False',
  concept: 'Concept',
  comparison: 'Comparison',
  fillblank: 'Fill Blank'
};

// ============================================================
// INITIALIZATION
// ============================================================

async function init() {
  console.log('Init started');

  // Check auth and update navbar
  await updateNavbar();
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/signin';
    return;
  }

  // Get course ID from URL
  const pathParts = window.location.pathname.split('/');
  courseId = pathParts[pathParts.length - 1];
  console.log('Course ID:', courseId);

  if (!courseId) {
    window.location.href = '/';
    return;
  }

  try {
    // Load course data
    console.log('Fetching course...');
    const response = await fetch(`/api/courses/${courseId}`);
    console.log('Course response status:', response.status);

    if (!response.ok) {
      throw new Error('Course not found');
    }
    course = await response.json();
    console.log('Course loaded:', course.name);

    // Update header
    document.getElementById('course-title').textContent = course.name;
    document.getElementById('course-description').textContent = course.description || '';
    document.getElementById('breadcrumb-course').textContent = course.name;
    document.title = `${course.name} - SelfEval`;
    console.log('Header updated');

    // Initialize all tabs (don't wait for all - init them independently)
    console.log('Initializing tabs...');
    initOverviewTab();
    initLearnTab();
    initPracticeTab();
    initHistoryTab();
    initInterviewTab();
    console.log('Tabs initialized');

    // Setup tab change handlers
    setupTabHandlers();

    // Check for retry question
    checkForRetryQuestion();
    console.log('Init complete');

  } catch (error) {
    console.error('Failed to load course:', error);
    document.getElementById('course-title').textContent = 'Course Not Found';
    document.getElementById('course-description').textContent = 'The requested course could not be found.';
  }
}

function setupTabHandlers() {
  // Refresh data when switching tabs
  document.getElementById('overview-tab').addEventListener('shown.bs.tab', loadOverviewData);
  document.getElementById('history-tab').addEventListener('shown.bs.tab', loadHistoryData);
  document.getElementById('interview-tab').addEventListener('shown.bs.tab', checkInterviewEligibility);
}

function checkForRetryQuestion() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('retry') === 'true') {
    const retryData = sessionStorage.getItem('retryQuestion');
    if (retryData) {
      try {
        const question = JSON.parse(retryData);
        sessionStorage.removeItem('retryQuestion');

        // Switch to practice tab
        const practiceTab = new bootstrap.Tab(document.getElementById('practice-tab'));
        practiceTab.show();

        // Set the topic selector
        document.getElementById('topic-select').value = question.topicId;
        document.getElementById('generate-btn').disabled = false;

        // Display the retry question
        currentQuestion = question;
        displayQuestion(question);

        // Clean up URL
        window.history.replaceState({}, document.title, `/course/${courseId}`);
      } catch (e) {
        console.error('Failed to load retry question:', e);
      }
    }
  }
}

// ============================================================
// OVERVIEW TAB
// ============================================================

async function initOverviewTab() {
  await loadOverviewData();
  document.getElementById('refresh-suggestions').addEventListener('click', loadSuggestions);
}

async function loadOverviewData() {
  try {
    const response = await fetch(`/api/performance/course/${courseId}`);
    performanceData = await response.json();

    updateOverviewCards();
    updateTopicChart();
    updateTypeChart();
    updateActivityList();
    await loadSuggestions();
  } catch (error) {
    console.error('Failed to load overview data:', error);
  }
}

function updateOverviewCards() {
  const coursePerf = performanceData.course || {};

  document.getElementById('overview-total').textContent = coursePerf.attempts || 0;
  document.getElementById('overview-correct').textContent = coursePerf.correct || 0;
  document.getElementById('overview-score').textContent = `${coursePerf.averageScore || 0}%`;
  document.getElementById('overview-topics').textContent = course.topics?.length || 0;
}

function updateTopicChart() {
  const topicCanvas = document.getElementById('topic-chart');
  const noTopicData = document.getElementById('no-topic-data');
  const topics = Object.entries(performanceData.topics || {});

  if (topics.length === 0) {
    topicCanvas.style.display = 'none';
    noTopicData.style.display = 'block';
    return;
  }

  topicCanvas.style.display = 'block';
  noTopicData.style.display = 'none';

  const labels = topics.map(([_, data]) => data.name);
  const scores = topics.map(([_, data]) => data.averageScore);
  const attempts = topics.map(([_, data]) => data.attempts);

  if (topicChart) {
    topicChart.destroy();
  }

  topicChart = new Chart(topicCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Average Score (%)',
        data: scores,
        backgroundColor: 'rgba(25, 135, 84, 0.7)',
        borderColor: 'rgba(25, 135, 84, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: value => value + '%' }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            afterLabel: (context) => `Attempts: ${attempts[context.dataIndex]}`
          }
        }
      }
    }
  });
}

function updateTypeChart() {
  const typeCanvas = document.getElementById('type-chart');
  const noTypeData = document.getElementById('no-type-data');
  const types = Object.entries(performanceData.byType || {}).filter(([_, data]) => data.attempts > 0);

  if (types.length === 0) {
    typeCanvas.style.display = 'none';
    noTypeData.style.display = 'block';
    return;
  }

  typeCanvas.style.display = 'block';
  noTypeData.style.display = 'none';

  const labels = types.map(([type, _]) => TYPE_LABELS[type] || type);
  const attempts = types.map(([_, data]) => data.attempts);
  const colors = [
    'rgba(13, 110, 253, 0.7)',
    'rgba(25, 135, 84, 0.7)',
    'rgba(255, 193, 7, 0.7)',
    'rgba(220, 53, 69, 0.7)',
    'rgba(13, 202, 240, 0.7)'
  ];

  if (typeChart) {
    typeChart.destroy();
  }

  typeChart = new Chart(typeCanvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: attempts,
        backgroundColor: colors.slice(0, types.length),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const typeData = types[context.dataIndex][1];
              const avg = typeData.attempts > 0 ? Math.round(typeData.totalScore / typeData.attempts) : 0;
              return `${context.label}: ${context.raw} attempts (${avg}% avg)`;
            }
          }
        }
      }
    }
  });
}

function updateActivityList() {
  const activityContent = document.getElementById('activity-content');
  const activities = performanceData.recentActivity || [];

  if (activities.length === 0) {
    activityContent.innerHTML = '<p class="text-muted text-center py-4">No recent activity</p>';
    return;
  }

  const html = activities.slice(0, 10).map(activity => {
    const date = new Date(activity.timestamp);
    const timeAgo = getTimeAgo(date);
    const icon = activity.isCorrect ? '✓' : '✗';
    const iconClass = activity.isCorrect ? 'text-success' : 'text-danger';
    const questionType = activity.questionType || 'practice';
    const typeLabels = {
      'mcq': 'Multiple Choice',
      'truefalse': 'True/False',
      'concept': 'Concept',
      'comparison': 'Comparison',
      'fillblank': 'Fill in Blank'
    };

    return `
      <div class="activity-item d-flex align-items-start mb-2 pb-2 border-bottom">
        <span class="${iconClass} me-2 fw-bold">${icon}</span>
        <div class="flex-grow-1">
          <div class="small fw-medium">${activity.topicName || 'Unknown Topic'}</div>
          <div class="small text-muted">${typeLabels[questionType] || questionType}</div>
          <div class="small text-muted">${timeAgo}</div>
        </div>
        <span class="badge ${activity.isCorrect ? 'bg-success' : 'bg-secondary'}">${activity.score}%</span>
      </div>
    `;
  }).join('');

  activityContent.innerHTML = html;
}

async function loadSuggestions() {
  const suggestionsContent = document.getElementById('suggestions-content');
  suggestionsContent.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border spinner-border-sm text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mb-0 mt-2">Loading suggestions...</p>
    </div>
  `;

  try {
    const response = await fetch(`/api/performance/suggestions?courseId=${courseId}`);
    const suggestions = await response.json();
    displaySuggestions(suggestions);
  } catch (error) {
    console.error('Failed to load suggestions:', error);
    suggestionsContent.innerHTML = '<div class="alert alert-warning mb-0">Failed to load suggestions.</div>';
  }
}

function displaySuggestions(suggestions) {
  const suggestionsContent = document.getElementById('suggestions-content');
  let html = `
    <div class="motivation-box mb-3 p-3 bg-light rounded">
      <p class="mb-0">${suggestions.motivation}</p>
    </div>
  `;

  if (suggestions.strengths?.length > 0) {
    html += `
      <div class="mb-3">
        <h6 class="text-success">Strengths</h6>
        <ul class="list-unstyled mb-0">
          ${suggestions.strengths.map(s => `<li class="small">• ${s}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (suggestions.areasToImprove?.length > 0) {
    html += `
      <div class="mb-3">
        <h6 class="text-warning">Areas to Improve</h6>
        <ul class="list-unstyled mb-0">
          ${suggestions.areasToImprove.map(a => `<li class="small">• ${a}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (suggestions.suggestions?.length > 0) {
    html += `
      <div class="mb-3">
        <h6 class="text-primary">Suggestions</h6>
        <ul class="list-unstyled mb-0">
          ${suggestions.suggestions.map(s => `<li class="small">• ${s}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  if (suggestions.nextSteps) {
    html += `
      <div class="next-steps p-2 bg-primary bg-opacity-10 rounded">
        <strong class="small">Next Steps:</strong>
        <p class="small mb-0">${suggestions.nextSteps}</p>
      </div>
    `;
  }

  suggestionsContent.innerHTML = html;
}

// ============================================================
// LEARN TAB
// ============================================================

let currentLesson = null;
let lessonMessages = [];
let lessonProgress = {};

async function initLearnTab() {
  renderLearnTopics();
  loadLessonProgress();

  // Event listeners
  document.getElementById('back-to-topics-btn').addEventListener('click', backToTopics);
  document.getElementById('end-lesson-btn').addEventListener('click', endLesson);
  document.getElementById('lesson-send-btn').addEventListener('click', sendLessonResponse);
  document.getElementById('lesson-hint-btn').addEventListener('click', requestHint);

  // Enter key to send
  document.getElementById('lesson-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendLessonResponse();
    }
  });
}

function renderLearnTopics() {
  const container = document.getElementById('learn-topics-list');

  if (!course.topics || course.topics.length === 0) {
    container.innerHTML = '<p class="text-muted text-center py-4">No topics available.</p>';
    return;
  }

  const html = course.topics.map((topic, tIndex) => `
    <div class="border-bottom">
      <div class="p-3 bg-light fw-medium">${topic.name}</div>
      ${topic.subtopics && topic.subtopics.length > 0 ? `
        <div class="list-group list-group-flush">
          ${topic.subtopics.map((subtopic, sIndex) => {
            const key = `${topic.id}:${sIndex}`;
            const isCompleted = lessonProgress[key]?.completed;
            return `
              <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center subtopic-btn"
                      data-topic-id="${topic.id}"
                      data-topic-name="${topic.name}"
                      data-subtopic="${subtopic}"
                      data-subtopic-index="${sIndex}">
                <span>${subtopic}</span>
                ${isCompleted ? '<span class="badge bg-success">Learned</span>' : '<span class="badge bg-secondary">Start</span>'}
              </button>
            `;
          }).join('')}
        </div>
      ` : '<p class="text-muted small p-3 mb-0">No subtopics</p>'}
    </div>
  `).join('');

  container.innerHTML = html;

  // Add click handlers
  document.querySelectorAll('.subtopic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const topicId = btn.dataset.topicId;
      const topicName = btn.dataset.topicName;
      const subtopic = btn.dataset.subtopic;
      const subtopicIndex = btn.dataset.subtopicIndex;
      startLesson(topicId, topicName, subtopic, subtopicIndex);
    });
  });
}

async function loadLessonProgress() {
  try {
    const response = await fetch(`/api/learn/progress/${courseId}`);
    if (response.ok) {
      lessonProgress = await response.json();
      renderLearnTopics(); // Re-render with progress
    }
  } catch (error) {
    console.error('Failed to load lesson progress:', error);
  }
}

async function startLesson(topicId, topicName, subtopic, subtopicIndex) {
  showLoading('Starting lesson...');

  try {
    const response = await fetch('/api/learn/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        topicId,
        topicName,
        subtopic,
        subtopicIndex,
        courseName: course.name
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to start lesson');
    }

    const data = await response.json();
    currentLesson = {
      sessionId: data.sessionId,
      topicId,
      topicName,
      subtopic,
      subtopicIndex,
      step: 1
    };
    lessonMessages = [{ role: 'tutor', content: data.message }];

    // Update UI
    document.getElementById('learn-topics').style.display = 'none';
    document.getElementById('lesson-view').style.display = 'block';
    document.getElementById('active-lesson-title').textContent = subtopic;
    document.getElementById('active-lesson-topic').textContent = topicName;
    document.getElementById('lesson-progress-badge').textContent = `Step ${currentLesson.step}`;

    renderLessonMessages();
  } catch (error) {
    console.error('Failed to start lesson:', error);
    alert('Failed to start lesson. Please try again.');
  } finally {
    hideLoading();
  }
}

function renderLessonMessages() {
  const container = document.getElementById('lesson-messages');

  container.innerHTML = lessonMessages.map(msg => `
    <div class="chat-message ${msg.role === 'tutor' ? 'interviewer' : 'user'} mb-3">
      <div class="chat-bubble ${msg.role === 'tutor' ? 'bg-light' : 'bg-primary text-white'} p-3 rounded">
        ${formatLessonContent(msg.content)}
      </div>
      <small class="text-muted">${msg.role === 'tutor' ? 'Tutor' : 'You'}</small>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

function formatLessonContent(content) {
  // Convert markdown-style formatting
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

async function sendLessonResponse() {
  const input = document.getElementById('lesson-input');
  const message = input.value.trim();

  if (!message || !currentLesson) return;

  lessonMessages.push({ role: 'user', content: message });
  input.value = '';
  renderLessonMessages();

  // Disable input
  input.disabled = true;
  document.getElementById('lesson-send-btn').disabled = true;

  try {
    const response = await fetch('/api/learn/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentLesson.sessionId,
        message
      })
    });

    if (!response.ok) throw new Error('Failed to get response');

    const data = await response.json();
    lessonMessages.push({ role: 'tutor', content: data.message });

    // Update step if progressed
    if (data.step) {
      currentLesson.step = data.step;
      document.getElementById('lesson-progress-badge').textContent = `Step ${data.step}`;
    }

    // Check if lesson is complete
    if (data.completed) {
      document.getElementById('lesson-progress-badge').textContent = 'Complete!';
      document.getElementById('lesson-progress-badge').className = 'badge bg-success me-2';

      // Mark as learned
      const key = `${currentLesson.topicId}:${currentLesson.subtopicIndex}`;
      lessonProgress[key] = { completed: true, completedAt: new Date().toISOString() };
    }

    renderLessonMessages();
  } catch (error) {
    console.error('Failed to send response:', error);
    lessonMessages.push({ role: 'tutor', content: 'Sorry, there was an error. Please try again.' });
    renderLessonMessages();
  } finally {
    input.disabled = false;
    document.getElementById('lesson-send-btn').disabled = false;
    input.focus();
  }
}

async function requestHint() {
  if (!currentLesson) return;

  document.getElementById('lesson-hint-btn').disabled = true;

  try {
    const response = await fetch('/api/learn/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentLesson.sessionId })
    });

    if (!response.ok) throw new Error('Failed to get hint');

    const data = await response.json();
    lessonMessages.push({ role: 'tutor', content: `💡 **Hint:** ${data.hint}` });
    renderLessonMessages();
  } catch (error) {
    console.error('Failed to get hint:', error);
  } finally {
    document.getElementById('lesson-hint-btn').disabled = false;
  }
}

function backToTopics() {
  if (currentLesson && !confirm('Are you sure you want to leave this lesson?')) return;
  resetLessonView();
}

async function endLesson() {
  if (!currentLesson) return;
  if (!confirm('End this lesson?')) return;

  try {
    await fetch('/api/learn/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentLesson.sessionId })
    });
  } catch (error) {
    console.error('Failed to end lesson:', error);
  }

  resetLessonView();
  loadLessonProgress(); // Refresh progress
}

function resetLessonView() {
  currentLesson = null;
  lessonMessages = [];
  document.getElementById('learn-topics').style.display = 'flex';
  document.getElementById('lesson-view').style.display = 'none';
  document.getElementById('lesson-messages').innerHTML = '';
  document.getElementById('lesson-input').value = '';
  document.getElementById('lesson-progress-badge').textContent = 'Step 1';
  document.getElementById('lesson-progress-badge').className = 'badge bg-info me-2';
}

// ============================================================
// PRACTICE TAB
// ============================================================

async function loadQuestionTypes() {
  const typeSelect = document.getElementById('type-select');
  const typeSelectContainer = typeSelect.closest('.col-md-6');
  const sectionTitle = document.getElementById('practice-section-title');

  try {
    const response = await fetch('/api/questions/types');
    const data = await response.json();

    // Check if learner is allowed to select question type
    if (!data.allowSelection) {
      // Hide the question type dropdown - always random
      typeSelectContainer.style.display = 'none';
      typeSelect.value = ''; // Ensure random selection
      sectionTitle.textContent = 'Select Topic';
      return;
    }

    // Show the dropdown if selection is allowed
    typeSelectContainer.style.display = 'block';
    sectionTitle.textContent = 'Select Topic & Question Type';

    // Keep "Random" as first option, add enabled types
    typeSelect.innerHTML = '<option value="">Random</option>';

    data.types.forEach(type => {
      const option = document.createElement('option');
      option.value = type.id;
      option.textContent = type.label;
      typeSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load question types:', error);
    // On error, hide the dropdown (default to random)
    typeSelectContainer.style.display = 'none';
    typeSelect.value = '';
  }
}

async function initPracticeTab() {
  // Populate topic dropdown
  const topicSelect = document.getElementById('topic-select');
  topicSelect.innerHTML = '<option value="">Select a topic...</option>';

  course.topics.forEach(topic => {
    const option = document.createElement('option');
    option.value = topic.id;
    option.textContent = topic.name;
    topicSelect.appendChild(option);
  });

  // Load question types from API
  await loadQuestionTypes();

  // Setup event listeners
  topicSelect.addEventListener('change', () => {
    // Show subtopics for selected topic
    const subtopicsSection = document.getElementById('practice-subtopics-section');
    const subtopicsList = document.getElementById('practice-subtopics-list');
    const generateBtn = document.getElementById('generate-btn');

    if (topicSelect.value) {
      const selectedTopic = course.topics.find(t => t.id === topicSelect.value);
      if (selectedTopic && selectedTopic.subtopics && selectedTopic.subtopics.length > 0) {
        subtopicsList.innerHTML = '';
        selectedTopic.subtopics.forEach((subtopic, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-outline-secondary btn-sm practice-subtopic-btn';
          btn.dataset.subtopicIndex = index;
          btn.textContent = subtopic;
          btn.addEventListener('click', () => {
            // Radio-style: deselect all others, select this one
            document.querySelectorAll('.practice-subtopic-btn').forEach(b => {
              b.classList.remove('active', 'btn-primary');
              b.classList.add('btn-outline-secondary');
            });
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('active', 'btn-primary');
            // Enable generate button when subtopic is selected
            generateBtn.disabled = false;
          });
          subtopicsList.appendChild(btn);
        });
        subtopicsSection.style.display = 'block';
        // Disable generate button until subtopic is selected
        generateBtn.disabled = true;
      } else {
        // No subtopics - enable generate button with topic selection
        subtopicsSection.style.display = 'none';
        generateBtn.disabled = false;
      }
    } else {
      subtopicsSection.style.display = 'none';
      generateBtn.disabled = true;
    }
  });

  document.getElementById('generate-btn').addEventListener('click', generateQuestion);
  document.getElementById('submit-btn').addEventListener('click', submitAnswer);
  document.getElementById('skip-btn').addEventListener('click', skipQuestion);
  document.getElementById('next-btn').addEventListener('click', () => {
    document.getElementById('result-section').style.display = 'none';
    generateQuestion();
  });

  // Answer input listeners
  document.querySelectorAll('input[name="tf-answer"]').forEach(input => {
    input.addEventListener('change', () => document.getElementById('submit-btn').disabled = false);
  });

  document.getElementById('answer-input').addEventListener('input', (e) => {
    document.getElementById('submit-btn').disabled = !e.target.value.trim();
    // Character counter
    const charCount = e.target.value.length;
    const counter = document.getElementById('answer-char-counter');
    counter.textContent = `${charCount} / 1500`;
    counter.className = charCount > 1400 ? 'text-danger' : 'text-muted';
  });

  document.getElementById('fillblank-input').addEventListener('input', (e) => {
    document.getElementById('submit-btn').disabled = !e.target.value.trim();
  });
}

async function generateQuestion() {
  const topicId = document.getElementById('topic-select').value;
  const questionType = document.getElementById('type-select').value;

  if (!topicId) {
    alert('Please select a topic');
    return;
  }

  // Get selected subtopic (mandatory)
  const selectedSubtopicBtn = document.querySelector('.practice-subtopic-btn.active');
  const subtopicsSection = document.getElementById('practice-subtopics-section');

  // Check if subtopics are shown and one must be selected
  if (subtopicsSection.style.display !== 'none' && !selectedSubtopicBtn) {
    alert('Please select a subtopic');
    return;
  }

  const selectedSubtopic = selectedSubtopicBtn ? selectedSubtopicBtn.textContent : null;

  showLoading('Generating question...');
  document.getElementById('result-section').style.display = 'none';

  try {
    const response = await fetch('/api/questions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courseId,
        topicId,
        questionType: questionType || undefined,
        subtopic: selectedSubtopic
      })
    });

    if (!response.ok) throw new Error('Failed to generate question');

    currentQuestion = await response.json();
    displayQuestion(currentQuestion);
  } catch (error) {
    console.error('Error generating question:', error);
    alert('Failed to generate question. Please check your API key and try again.');
  } finally {
    hideLoading();
  }
}

function displayQuestion(question) {
  const questionSection = document.getElementById('question-section');
  questionSection.style.display = 'block';

  document.getElementById('question-text').textContent = question.question;
  document.getElementById('question-type-badge').textContent = TYPE_LABELS[question.type] || question.type;
  document.getElementById('question-context').textContent = `${question.topicName}`;

  // Hide all answer types
  document.getElementById('mcq-options').style.display = 'none';
  document.getElementById('tf-options').style.display = 'none';
  document.getElementById('text-answer').style.display = 'none';
  document.getElementById('fillblank-answer').style.display = 'none';

  // Reset inputs
  document.getElementById('answer-input').value = '';
  document.getElementById('fillblank-input').value = '';
  document.querySelectorAll('input[name="mcq-answer"]').forEach(input => input.checked = false);
  document.querySelectorAll('input[name="tf-answer"]').forEach(input => input.checked = false);
  document.getElementById('submit-btn').disabled = true;

  // Hide answer guide by default
  const answerGuide = document.getElementById('answer-guide');
  const conceptGuide = document.getElementById('concept-guide');
  const comparisonGuide = document.getElementById('comparison-guide');
  if (answerGuide) {
    answerGuide.style.display = 'none';
    conceptGuide.style.display = 'none';
    comparisonGuide.style.display = 'none';
    // Reset collapse state
    const collapseEl = document.getElementById('answer-format-guide');
    if (collapseEl && collapseEl.classList.contains('show')) {
      collapseEl.classList.remove('show');
    }
  }

  // Show appropriate answer type
  switch (question.type) {
    case 'mcq':
      displayMCQ(question);
      break;
    case 'truefalse':
      document.getElementById('tf-options').style.display = 'block';
      break;
    case 'concept':
      document.getElementById('text-answer').style.display = 'block';
      document.getElementById('answer-input').placeholder = 'Explain the concept in your own words...';
      // Show concept answer guide
      if (answerGuide) {
        answerGuide.style.display = 'block';
        conceptGuide.style.display = 'block';
      }
      break;
    case 'comparison':
      document.getElementById('text-answer').style.display = 'block';
      document.getElementById('answer-input').placeholder = 'Write your comparison of the two items...';
      // Show comparison answer guide
      if (answerGuide) {
        answerGuide.style.display = 'block';
        comparisonGuide.style.display = 'block';
      }
      break;
    case 'fillblank':
      document.getElementById('fillblank-answer').style.display = 'block';
      break;
  }

  questionSection.scrollIntoView({ behavior: 'smooth' });
}

function displayMCQ(question) {
  const mcqOptions = document.getElementById('mcq-options');
  mcqOptions.innerHTML = '';
  mcqOptions.style.display = 'block';

  question.options.forEach((option, index) => {
    const div = document.createElement('div');
    div.className = 'form-check mb-2';
    div.innerHTML = `
      <input class="form-check-input" type="radio" name="mcq-answer" id="mcq-${index}" value="${index}">
      <label class="form-check-label" for="mcq-${index}">${option}</label>
    `;
    mcqOptions.appendChild(div);
  });

  document.querySelectorAll('input[name="mcq-answer"]').forEach(input => {
    input.addEventListener('change', () => document.getElementById('submit-btn').disabled = false);
  });
}

function getUserAnswer() {
  switch (currentQuestion.type) {
    case 'mcq':
      const mcqSelected = document.querySelector('input[name="mcq-answer"]:checked');
      return mcqSelected ? mcqSelected.value : null;
    case 'truefalse':
      const tfSelected = document.querySelector('input[name="tf-answer"]:checked');
      return tfSelected ? tfSelected.value : null;
    case 'concept':
    case 'comparison':
      return document.getElementById('answer-input').value.trim();
    case 'fillblank':
      return document.getElementById('fillblank-input').value.trim();
    default:
      return null;
  }
}

let lastResultData = null; // Store last result for dispute

async function submitAnswer() {
  const userAnswer = getUserAnswer();

  if (userAnswer === null || userAnswer === '') {
    alert('Please provide an answer');
    return;
  }

  showLoading('Evaluating answer...');

  try {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionData: currentQuestion, userAnswer })
    });

    if (!response.ok) throw new Error('Failed to evaluate answer');

    const result = await response.json();
    lastResultData = { ...result, userAnswer };
    displayResult(result);
  } catch (error) {
    console.error('Error evaluating answer:', error);
    alert('Failed to evaluate answer. Please try again.');
  } finally {
    hideLoading();
  }
}

async function skipQuestion() {
  if (!currentQuestion) return;

  showLoading('Recording skip...');

  try {
    // Record the skip as 0 score
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionData: currentQuestion,
        userAnswer: '[SKIPPED]',
        skipped: true
      })
    });

    if (!response.ok) throw new Error('Failed to record skip');

    const result = await response.json();
    displaySkipResult();
  } catch (error) {
    console.error('Error skipping question:', error);
    // Still show skip result even if recording fails
    displaySkipResult();
  } finally {
    hideLoading();
  }
}

function displaySkipResult() {
  const resultSection = document.getElementById('result-section');
  const resultCard = document.getElementById('result-card');
  const resultIcon = document.getElementById('result-icon');
  const resultStatus = document.getElementById('result-status');
  const resultScore = document.getElementById('result-score');
  const resultFeedback = document.getElementById('result-feedback');

  resultSection.style.display = 'block';
  document.getElementById('question-section').style.display = 'none';

  resultCard.className = 'card border-secondary';
  resultIcon.textContent = '⏭';
  resultIcon.className = 'result-icon';
  resultIcon.style.backgroundColor = '#e9ecef';
  resultIcon.style.color = '#6c757d';
  resultStatus.textContent = 'Skipped';
  resultScore.className = 'badge bg-secondary';
  resultScore.textContent = 'Score: 0%';
  resultFeedback.textContent = 'Question skipped. This has been recorded in your performance history.';
  resultFeedback.className = 'alert alert-secondary';

  // Hide detailed feedback sections
  document.getElementById('detailed-feedback').style.display = 'none';
  document.getElementById('strengths-section').style.display = 'none';
  document.getElementById('missing-section').style.display = 'none';

  resultSection.scrollIntoView({ behavior: 'smooth' });
}

function displayResult(result) {
  const resultSection = document.getElementById('result-section');
  const resultCard = document.getElementById('result-card');
  const resultIcon = document.getElementById('result-icon');
  const resultStatus = document.getElementById('result-status');
  const resultScore = document.getElementById('result-score');
  const resultFeedback = document.getElementById('result-feedback');

  resultSection.style.display = 'block';
  document.getElementById('question-section').style.display = 'none';

  if (result.isCorrect) {
    resultCard.className = 'card border-success';
    resultIcon.textContent = '✓';
    resultIcon.className = 'result-icon success';
    resultStatus.textContent = 'Correct!';
    resultScore.className = 'badge bg-success';
  } else {
    resultCard.className = 'card border-danger';
    resultIcon.textContent = '✗';
    resultIcon.className = 'result-icon error';
    resultStatus.textContent = 'Incorrect';
    resultScore.className = 'badge bg-danger';
  }

  resultScore.textContent = `Score: ${result.score}%`;
  resultFeedback.textContent = result.feedback;
  resultFeedback.className = result.isCorrect ? 'alert alert-success' : 'alert alert-info';

  // Detailed feedback
  const detailedFeedback = document.getElementById('detailed-feedback');
  const strengthsSection = document.getElementById('strengths-section');
  const missingSection = document.getElementById('missing-section');

  detailedFeedback.style.display = 'none';
  strengthsSection.style.display = 'none';
  missingSection.style.display = 'none';

  if (result.strengths?.length > 0) {
    strengthsSection.style.display = 'block';
    detailedFeedback.style.display = 'block';
    document.getElementById('strengths-list').innerHTML = result.strengths.map(s => `<li>${s}</li>`).join('');
  }

  if (result.missingPoints?.length > 0) {
    missingSection.style.display = 'block';
    detailedFeedback.style.display = 'block';
    document.getElementById('missing-list').innerHTML = result.missingPoints.map(m => `<li>${m}</li>`).join('');
  }

  // Show dispute button for AI-evaluated questions (concept, comparison, fillblank)
  const disputeContainer = document.getElementById('result-dispute-container');
  if (disputeContainer) {
    const disputeTypes = ['concept', 'comparison', 'fillblank'];
    if (result.historyId && disputeTypes.includes(result.questionType)) {
      disputeContainer.innerHTML = `
        <div class="mt-3 pt-3 border-top">
          <p class="text-muted small mb-2">Think the AI evaluation was unfair?</p>
          <button class="btn btn-outline-warning btn-sm" onclick="showResultDisputeForm()">
            Dispute AI Evaluation
          </button>
          <div id="result-dispute-form" class="mt-3" style="display: none;">
            <textarea id="result-dispute-reason" class="form-control mb-2" rows="3"
              placeholder="Explain why you believe your answer deserves a higher score..."></textarea>
            <div class="d-flex gap-2">
              <button class="btn btn-warning btn-sm" onclick="submitResultDispute()">Submit Dispute</button>
              <button class="btn btn-secondary btn-sm" onclick="hideResultDisputeForm()">Cancel</button>
            </div>
          </div>
        </div>
      `;
      disputeContainer.style.display = 'block';
    } else {
      disputeContainer.style.display = 'none';
      disputeContainer.innerHTML = '';
    }
  }

  resultSection.scrollIntoView({ behavior: 'smooth' });
}

function showResultDisputeForm() {
  document.getElementById('result-dispute-form').style.display = 'block';
}

function hideResultDisputeForm() {
  document.getElementById('result-dispute-form').style.display = 'none';
  document.getElementById('result-dispute-reason').value = '';
}

async function submitResultDispute() {
  if (!lastResultData || !lastResultData.historyId) {
    alert('Unable to submit dispute. Please try again.');
    return;
  }

  const reason = document.getElementById('result-dispute-reason').value.trim();
  if (reason.length < 10) {
    alert('Please provide a more detailed explanation (at least 10 characters).');
    return;
  }

  try {
    const response = await fetch('/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        historyId: lastResultData.historyId,
        disputeReason: reason
      })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Dispute submitted successfully. An admin will review your request.');
      document.getElementById('result-dispute-container').innerHTML = `
        <div class="alert alert-warning mt-3">
          <strong>Dispute Submitted</strong><br>
          <small>Your dispute is pending review. Check the History tab for updates.</small>
        </div>
      `;
    } else {
      alert(data.error || 'Failed to submit dispute');
    }
  } catch (error) {
    console.error('Error submitting dispute:', error);
    alert('Failed to submit dispute. Please try again.');
  }
}

// ============================================================
// HISTORY TAB
// ============================================================

async function initHistoryTab() {
  // Populate topic filter
  const filterTopic = document.getElementById('filter-topic');
  filterTopic.innerHTML = '<option value="">All Topics</option>';

  course.topics.forEach(topic => {
    const option = document.createElement('option');
    option.value = topic.id;
    option.textContent = topic.name;
    filterTopic.appendChild(option);
  });

  // Setup event listeners for Q&A history
  filterTopic.addEventListener('change', renderHistory);
  document.getElementById('filter-result').addEventListener('change', renderHistory);
  document.getElementById('retry-btn').addEventListener('click', retryQuestion);

  // Check if clear history is allowed and setup button accordingly
  const clearHistoryBtn = document.getElementById('clear-course-history-btn');
  try {
    const response = await fetch('/api/settings/learner-features');
    if (response.ok) {
      const features = await response.json();
      if (features.allow_clear_history) {
        clearHistoryBtn.style.display = 'inline-block';
        clearHistoryBtn.addEventListener('click', clearCourseHistory);
      } else {
        clearHistoryBtn.style.display = 'none';
      }
    } else {
      // Default to hidden if can't fetch settings
      clearHistoryBtn.style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to fetch learner features:', error);
    // Default to hidden on error
    clearHistoryBtn.style.display = 'none';
  }

  // Setup event listener for interview history sub-tab
  document.getElementById('interview-history-tab').addEventListener('shown.bs.tab', loadPastInterviews);
  document.getElementById('clear-interview-history-btn').addEventListener('click', clearInterviewHistory);

  // Setup event listener for disputes sub-tab
  document.getElementById('disputes-tab').addEventListener('shown.bs.tab', loadDisputes);
  document.getElementById('dispute-filter').addEventListener('change', loadDisputes);

  await loadHistoryData();
  await loadDisputesBadge();
}

async function loadHistoryData() {
  try {
    const response = await fetch(`/api/history/course/${courseId}`);
    const data = await response.json();
    historyData = data.questions || [];
    renderHistory();
  } catch (error) {
    console.error('Failed to load history:', error);
    document.getElementById('history-list').innerHTML = '<div class="alert alert-danger">Failed to load history</div>';
  }
}

function renderHistory() {
  const filterTopic = document.getElementById('filter-topic').value;
  const filterResult = document.getElementById('filter-result').value;

  let filtered = [...historyData];

  if (filterTopic) {
    filtered = filtered.filter(q => q.question.topicId === filterTopic);
  }

  if (filterResult === 'correct') {
    filtered = filtered.filter(q => q.result.isCorrect);
  } else if (filterResult === 'incorrect') {
    filtered = filtered.filter(q => !q.result.isCorrect);
  }

  // Update stats
  const correct = filtered.filter(q => q.result.isCorrect).length;
  document.getElementById('history-stat-total').textContent = filtered.length;
  document.getElementById('history-stat-correct').textContent = correct;
  document.getElementById('history-stat-incorrect').textContent = filtered.length - correct;

  const historyList = document.getElementById('history-list');

  if (filtered.length === 0) {
    historyList.innerHTML = `
      <div class="text-center py-5">
        <p class="text-muted">No questions in history yet.</p>
        <button class="btn btn-primary" onclick="document.getElementById('practice-tab').click()">Start Practicing</button>
      </div>
    `;
    return;
  }

  const html = filtered.map(item => {
    const date = new Date(item.timestamp);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    const icon = item.result.isCorrect ? '✓' : '✗';
    const iconClass = item.result.isCorrect ? 'text-success' : 'text-danger';
    const borderClass = item.result.isCorrect ? 'border-success' : 'border-danger';

    return `
      <div class="card mb-3 history-card ${borderClass}" data-id="${item.id}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center mb-2">
                <span class="${iconClass} me-2 fs-4">${icon}</span>
                <span class="badge bg-secondary me-2">${item.question.topicName}</span>
                <span class="badge bg-outline-secondary">${TYPE_LABELS[item.question.type] || item.question.type}</span>
              </div>
              <p class="mb-2">${item.question.question}</p>
              <small class="text-muted">${dateStr}</small>
            </div>
            <div class="d-flex align-items-center gap-2 ms-3">
              <span class="badge ${item.result.isCorrect ? 'bg-success' : 'bg-danger'} fs-6">${item.result.score}%</span>
              <button class="btn btn-sm btn-outline-primary view-details-btn" data-id="${item.id}">Details</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  historyList.innerHTML = html;

  document.querySelectorAll('.view-details-btn').forEach(btn => {
    btn.addEventListener('click', (e) => showQuestionDetails(e.target.dataset.id));
  });
}

async function showQuestionDetails(id) {
  const item = historyData.find(q => q.id == id);
  if (!item) return;

  window.selectedHistoryQuestion = item;

  const q = item.question;
  const r = item.result;

  // Check if this question type can be disputed
  const disputableTypes = ['concept', 'comparison', 'fillblank'];
  const canDispute = disputableTypes.includes(q.type);

  // Check if a dispute already exists
  let disputeInfo = null;
  if (canDispute) {
    try {
      const res = await fetch(`/api/disputes/check/${item.id}`);
      if (res.ok) {
        disputeInfo = await res.json();
      }
    } catch (e) {
      console.error('Failed to check dispute status:', e);
    }
  }

  let answerSection = '';

  if (q.type === 'mcq' && q.options) {
    answerSection = `
      <h6>Options:</h6>
      <ul class="list-unstyled">
        ${q.options.map((opt, i) => {
          const isCorrect = i === q.correctAnswer;
          const isUserAnswer = i === parseInt(item.userAnswer);
          let classes = '';
          if (isCorrect) classes = 'text-success fw-bold';
          if (isUserAnswer && !isCorrect) classes = 'text-danger';
          return `<li class="${classes}">${isCorrect ? '✓' : ''} ${isUserAnswer ? '(Your answer) ' : ''}${opt}</li>`;
        }).join('')}
      </ul>
    `;
  } else if (q.type === 'truefalse') {
    answerSection = `
      <p><strong>Correct Answer:</strong> <span class="text-success">${q.correctAnswer ? 'True' : 'False'}</span></p>
      <p><strong>Your Answer:</strong> <span class="${r.isCorrect ? 'text-success' : 'text-danger'}">${item.userAnswer === 'true' ? 'True' : 'False'}</span></p>
    `;
  } else if (q.type === 'fillblank') {
    answerSection = `
      <p><strong>Correct Answer:</strong> <span class="text-success">${q.correctAnswer}</span></p>
      <p><strong>Your Answer:</strong> <span class="${r.isCorrect ? 'text-success' : 'text-danger'}">${item.userAnswer}</span></p>
    `;
  } else {
    answerSection = `
      <h6>Your Answer:</h6>
      <p class="bg-light p-2 rounded">${item.userAnswer}</p>
      ${q.sampleAnswer ? `<h6>Sample Answer:</h6><p class="bg-light p-2 rounded">${q.sampleAnswer}</p>` : ''}
    `;
  }

  let feedbackSection = '';
  if (r.strengths?.length > 0) {
    feedbackSection += `<h6 class="text-success">Strengths:</h6><ul>${r.strengths.map(s => `<li>${s}</li>`).join('')}</ul>`;
  }
  if (r.missingPoints?.length > 0) {
    feedbackSection += `<h6 class="text-warning">Areas to improve:</h6><ul>${r.missingPoints.map(m => `<li>${m}</li>`).join('')}</ul>`;
  }

  // Build dispute section
  let disputeSection = '';
  if (canDispute) {
    if (disputeInfo?.hasDispute) {
      const d = disputeInfo.dispute;
      const statusBadge = d.status === 'pending' ? 'bg-warning' : d.status === 'approved' ? 'bg-success' : 'bg-danger';
      const statusText = d.status.charAt(0).toUpperCase() + d.status.slice(1);
      disputeSection = `
        <div class="alert alert-secondary mt-3">
          <h6>Dispute Status: <span class="badge ${statusBadge}">${statusText}</span></h6>
          <p class="mb-1"><strong>Your reason:</strong> ${d.dispute_reason}</p>
          ${d.admin_comments ? `<p class="mb-1"><strong>Admin response:</strong> ${d.admin_comments}</p>` : ''}
          ${d.new_score !== null ? `<p class="mb-0"><strong>New score:</strong> ${d.new_score}%</p>` : ''}
        </div>
      `;
    } else {
      disputeSection = `
        <div class="mt-3 pt-3 border-top">
          <button class="btn btn-outline-warning btn-sm" onclick="showDisputeForm(${item.id})">
            Dispute AI Evaluation
          </button>
          <small class="text-muted ms-2">Think the AI got it wrong? Submit a dispute for review.</small>
        </div>
        <div id="dispute-form-${item.id}" class="mt-3" style="display: none;">
          <div class="card border-warning">
            <div class="card-body">
              <h6 class="card-title">Submit Dispute</h6>
              <p class="text-muted small">Explain why you believe the AI evaluation was incorrect.</p>
              <textarea id="dispute-reason-${item.id}" class="form-control mb-2" rows="3"
                placeholder="Please explain why you think your answer deserves a better score..."></textarea>
              <div class="d-flex gap-2">
                <button class="btn btn-warning btn-sm" onclick="submitDispute(${item.id})">Submit Dispute</button>
                <button class="btn btn-secondary btn-sm" onclick="hideDisputeForm(${item.id})">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  document.getElementById('modal-content').innerHTML = `
    <div class="mb-3">
      <span class="badge ${r.isCorrect ? 'bg-success' : 'bg-danger'}">${r.isCorrect ? 'Correct' : 'Incorrect'}</span>
      <span class="badge bg-secondary">${q.topicName}</span>
      <span class="badge bg-info">${TYPE_LABELS[q.type] || q.type}</span>
      <span class="badge bg-dark">${r.score}%</span>
    </div>
    <h5>Question</h5>
    <p class="lead">${q.question}</p>
    ${answerSection}
    <h6>Explanation:</h6>
    <div class="alert alert-info">${r.feedback || q.explanation || 'No explanation available.'}</div>
    ${feedbackSection}
    ${disputeSection}
  `;

  const modal = new bootstrap.Modal(document.getElementById('questionModal'));
  modal.show();
}

function showDisputeForm(historyId) {
  document.getElementById(`dispute-form-${historyId}`).style.display = 'block';
}

function hideDisputeForm(historyId) {
  document.getElementById(`dispute-form-${historyId}`).style.display = 'none';
}

async function submitDispute(historyId) {
  const reasonEl = document.getElementById(`dispute-reason-${historyId}`);
  const reason = reasonEl.value.trim();

  if (reason.length < 10) {
    alert('Please provide a more detailed explanation (at least 10 characters).');
    return;
  }

  try {
    const res = await fetch('/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historyId, disputeReason: reason })
    });

    const data = await res.json();

    if (res.ok) {
      alert('Dispute submitted successfully! An admin will review it.');
      // Refresh the modal to show dispute status
      showQuestionDetails(historyId);
    } else {
      alert(data.error || 'Failed to submit dispute');
    }
  } catch (error) {
    console.error('Error submitting dispute:', error);
    alert('Failed to submit dispute. Please try again.');
  }
}

function retryQuestion() {
  if (!window.selectedHistoryQuestion) return;

  sessionStorage.setItem('retryQuestion', JSON.stringify(window.selectedHistoryQuestion.question));
  const modal = bootstrap.Modal.getInstance(document.getElementById('questionModal'));
  modal.hide();
  window.location.href = `/course/${courseId}?retry=true`;
}

async function clearCourseHistory() {
  if (!confirm('Are you sure you want to clear all history for this course?')) return;

  try {
    const response = await fetch(`/api/history/course/${courseId}`, { method: 'DELETE' });
    if (response.ok) {
      historyData = [];
      renderHistory();
    }
  } catch (error) {
    console.error('Failed to clear history:', error);
    alert('Failed to clear history');
  }
}

// ============================================================
// DISPUTES
// ============================================================

let disputesData = [];

async function loadDisputesBadge() {
  try {
    const response = await fetch('/api/disputes?status=pending');
    if (response.ok) {
      const data = await response.json();
      const pendingCount = data.disputes.length;
      const badge = document.getElementById('disputes-badge');
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Failed to load disputes badge:', error);
  }
}

async function loadDisputes() {
  const container = document.getElementById('disputes-list');
  const filter = document.getElementById('dispute-filter').value;

  container.innerHTML = '<p class="text-muted text-center py-3">Loading disputes...</p>';

  try {
    const url = filter ? `/api/disputes?status=${filter}` : '/api/disputes';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load disputes');

    const data = await response.json();
    disputesData = data.disputes || [];

    renderDisputes();
  } catch (error) {
    console.error('Failed to load disputes:', error);
    container.innerHTML = '<div class="alert alert-danger">Failed to load disputes</div>';
  }
}

function renderDisputes() {
  const container = document.getElementById('disputes-list');

  if (disputesData.length === 0) {
    container.innerHTML = '<p class="text-muted text-center py-3">No disputes found</p>';
    return;
  }

  const html = disputesData.map(d => {
    const statusBadge = d.status === 'pending' ? 'bg-warning text-dark' :
                        d.status === 'approved' ? 'bg-success' : 'bg-danger';
    const statusText = d.status.charAt(0).toUpperCase() + d.status.slice(1);
    const dateStr = new Date(d.created_at).toLocaleDateString();
    const q = d.question_data;

    return `
      <div class="card mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="badge ${statusBadge} me-2">${statusText}</span>
              <span class="badge bg-secondary me-2">${TYPE_LABELS[q.type] || q.type}</span>
              <small class="text-muted">${dateStr}</small>
            </div>
            <div>
              <span class="badge bg-dark">Original: ${d.original_score}%</span>
              ${d.new_score !== null ? `<span class="badge bg-success ms-1">New: ${d.new_score}%</span>` : ''}
            </div>
          </div>

          <h6 class="mb-2">${q.question}</h6>

          <div class="bg-light p-2 rounded mb-2">
            <small class="text-muted">Your answer:</small>
            <p class="mb-0 small">${d.user_answer}</p>
          </div>

          <div class="bg-warning bg-opacity-10 p-2 rounded mb-2">
            <small class="text-muted">Your dispute reason:</small>
            <p class="mb-0 small">${d.dispute_reason}</p>
          </div>

          ${d.admin_comments ? `
            <div class="bg-info bg-opacity-10 p-2 rounded">
              <small class="text-muted">Admin response:</small>
              <p class="mb-0 small">${d.admin_comments}</p>
            </div>
          ` : ''}

          ${d.status !== 'pending' && d.resolved_at ? `
            <small class="text-muted d-block mt-2">Resolved on ${new Date(d.resolved_at).toLocaleDateString()}</small>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// ============================================================
// INTERVIEW TAB
// ============================================================

let interviewEligible = true;
let eligibleTopicIds = [];

async function checkInterviewEligibility() {
  // Don't modify UI if an interview is already in progress
  if (interviewSession) {
    return;
  }

  try {
    const response = await fetch(`/api/interview/eligibility/${courseId}`);
    const data = await response.json();

    const warningEl = document.getElementById('interview-eligibility-warning');
    const setupEl = document.getElementById('interview-setup');

    // Store eligible topic IDs
    eligibleTopicIds = (data.topicsEligible || []).map(t => t.id);

    // Update topic checkboxes to show which are eligible
    updateTopicCheckboxes(data.topicProgress || [], data.requirements.minQuestionsPerTopic);

    if (!data.eligible) {
      interviewEligible = false;

      // Build the message
      const messages = [];
      if (!data.meetsQuestionRequirement) {
        messages.push(`Practice at least ${data.requirements.minQuestionsPerTopic} questions in at least one topic`);
      }
      if (!data.meetsScoreRequirement) {
        messages.push(`Achieve an average score of at least ${data.requirements.minScore}% (your current average is ${data.current.avgScore}%)`);
      }
      if (!data.withinDailyLimit) {
        messages.push(`You've reached your daily limit of ${data.requirements.dailyLimit} interview questions. Try again tomorrow.`);
      }

      let messageHtml = 'Before you can start an interview, you need to:<ul class="mb-0 mt-2">' +
        messages.map(m => `<li>${m}</li>`).join('') + '</ul>';

      // Show per-topic progress if there are topics not meeting requirements
      if (data.topicsNotMeeting && data.topicsNotMeeting.length > 0) {
        messageHtml += '<div class="mt-3"><strong>Topics needing more practice:</strong></div>';
        messageHtml += '<div class="row g-2 mt-1">';
        data.topicsNotMeeting.forEach(topic => {
          const progress = Math.round((topic.current / topic.required) * 100);
          messageHtml += `
            <div class="col-md-6">
              <div class="d-flex align-items-center">
                <span class="me-2">${topic.name}:</span>
                <div class="progress flex-grow-1" style="height: 20px;">
                  <div class="progress-bar bg-warning" style="width: ${progress}%">${topic.current}/${topic.required}</div>
                </div>
              </div>
            </div>
          `;
        });
        messageHtml += '</div>';
      }

      document.getElementById('eligibility-message').innerHTML = messageHtml;

      let progressText = `${data.current.totalQuestions} total questions, ${data.current.avgScore}% average score`;
      if (data.requirements.dailyLimit > 0) {
        progressText += ` | Today: ${data.current.todayQuestionCount}/${data.requirements.dailyLimit} interview questions`;
      }
      document.getElementById('eligibility-progress').textContent = progressText;

      warningEl.style.display = 'block';
      setupEl.style.display = 'none';
    } else {
      interviewEligible = true;

      // Show info about locked topics if any
      if (data.topicsNotMeeting && data.topicsNotMeeting.length > 0) {
        warningEl.querySelector('h5').textContent = 'Some Topics Locked';
        let messageHtml = `<p>You can start an interview with ${eligibleTopicIds.length} topic(s). The following topics need more practice:</p>`;
        messageHtml += '<div class="row g-2">';
        data.topicsNotMeeting.forEach(topic => {
          const progress = Math.round((topic.current / topic.required) * 100);
          messageHtml += `
            <div class="col-md-6">
              <div class="d-flex align-items-center">
                <span class="me-2 text-muted">${topic.name}:</span>
                <div class="progress flex-grow-1" style="height: 18px;">
                  <div class="progress-bar bg-secondary" style="width: ${progress}%">${topic.current}/${topic.required}</div>
                </div>
              </div>
            </div>
          `;
        });
        messageHtml += '</div>';

        document.getElementById('eligibility-message').innerHTML = messageHtml;
        document.getElementById('eligibility-progress').textContent = '';
        warningEl.classList.remove('alert-warning');
        warningEl.classList.add('alert-info');
        warningEl.style.display = 'block';
      } else {
        warningEl.style.display = 'none';
      }

      setupEl.style.display = 'block';
    }
  } catch (error) {
    console.error('Failed to check interview eligibility:', error);
    // On error, allow access (fail open)
    interviewEligible = true;
    eligibleTopicIds = course.topics.map(t => t.id);
  }
}

function updateTopicCheckboxes(topicProgress, minRequired) {
  const topicsList = document.getElementById('interview-topics-list');
  if (!topicsList || !course) return;

  topicsList.innerHTML = course.topics.map(topic => {
    const progress = topicProgress.find(p => p.id === topic.id);
    const isEligible = eligibleTopicIds.includes(topic.id);
    const questionsAnswered = progress?.questionsAnswered || 0;

    if (isEligible) {
      return `
        <div class="col-md-6">
          <div class="form-check">
            <input class="form-check-input interview-topic-check" type="checkbox" value="${topic.id}" id="int-topic-${topic.id}">
            <label class="form-check-label" for="int-topic-${topic.id}">
              ${topic.name}
              <span class="badge bg-success ms-1">${questionsAnswered} practiced</span>
            </label>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="col-md-6">
          <div class="form-check">
            <input class="form-check-input interview-topic-check" type="checkbox" value="${topic.id}" id="int-topic-${topic.id}" disabled>
            <label class="form-check-label text-muted" for="int-topic-${topic.id}">
              ${topic.name}
              <span class="badge bg-secondary ms-1">${questionsAnswered}/${minRequired}</span>
              <i class="bi bi-lock-fill ms-1"></i>
            </label>
          </div>
        </div>
      `;
    }
  }).join('');
}

async function initInterviewTab() {
  // Check eligibility first (this also populates topic checkboxes)
  await checkInterviewEligibility();

  // Load personas and roles
  await Promise.all([loadPersonas(), loadRoles()]);

  // Toggle topic selection visibility
  document.querySelectorAll('input[name="interview-topic-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      document.getElementById('topic-checkboxes').style.display = e.target.value === 'select' ? 'block' : 'none';
    });
  });

  // Persona selection change handler
  document.getElementById('persona-select').addEventListener('change', (e) => {
    const personaId = e.target.value;
    const persona = personas.find(p => p.id === personaId);
    const descEl = document.getElementById('persona-description');
    if (persona) {
      descEl.textContent = persona.description;
    } else {
      descEl.textContent = '';
    }
  });

  // Role selection change handler
  document.getElementById('role-select').addEventListener('change', (e) => {
    const roleId = e.target.value;
    const allRoles = [...roles.genericRoles, ...roles.courseRoles];
    const role = allRoles.find(r => r.id === roleId);
    const descEl = document.getElementById('role-description');
    if (role) {
      descEl.textContent = role.description || role.yearsExperience || '';
    } else {
      descEl.textContent = '';
    }
  });

  // Setup event listeners
  document.getElementById('start-interview-btn').addEventListener('click', startInterview);
  document.getElementById('end-interview-btn').addEventListener('click', endInterview);
  document.getElementById('send-response-btn').addEventListener('click', sendInterviewResponse);
  document.getElementById('skip-interview-btn').addEventListener('click', skipInterviewQuestion);
  document.getElementById('new-interview-btn').addEventListener('click', resetInterview);

  // Enter key to send
  document.getElementById('interview-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendInterviewResponse();
    }
  });

  // Character counter
  document.getElementById('interview-input').addEventListener('input', (e) => {
    const charCount = e.target.value.length;
    const counter = document.getElementById('char-counter');
    counter.textContent = `${charCount} / 1500`;
    counter.className = charCount > 1400 ? 'text-danger' : 'text-muted';
  });
}

async function loadPersonas() {
  try {
    const response = await fetch('/api/interview/personas');
    personas = await response.json();

    const select = document.getElementById('persona-select');
    // Keep the default option
    personas.forEach(persona => {
      const option = document.createElement('option');
      option.value = persona.id;
      option.textContent = persona.name;
      select.appendChild(option);
    });

    // Set default to Technical Lead
    select.value = 'technical-lead';
    // Trigger change to show description
    select.dispatchEvent(new Event('change'));
  } catch (error) {
    console.error('Failed to load personas:', error);
  }
}

async function loadRoles() {
  try {
    const response = await fetch(`/api/interview/roles?courseId=${courseId}`);
    roles = await response.json();

    const genericGroup = document.getElementById('generic-roles-group');
    const courseGroup = document.getElementById('course-roles-group');

    // Clear and populate generic roles
    genericGroup.innerHTML = '';
    roles.genericRoles.forEach(role => {
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = `${role.name} (${role.yearsExperience})`;
      genericGroup.appendChild(option);
    });

    // Clear and populate course-specific roles
    courseGroup.innerHTML = '';
    if (roles.courseRoles.length > 0) {
      roles.courseRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.id;
        option.textContent = role.name;
        courseGroup.appendChild(option);
      });
    } else {
      // Hide the course roles group if no course-specific roles
      courseGroup.style.display = 'none';
    }

    // Set default to Junior Developer
    const roleSelect = document.getElementById('role-select');
    roleSelect.value = 'junior';
    // Trigger change to show description
    roleSelect.dispatchEvent(new Event('change'));
  } catch (error) {
    console.error('Failed to load roles:', error);
  }
}

async function startInterview() {
  const topicMode = document.querySelector('input[name="interview-topic-mode"]:checked').value;
  let selectedTopics = 'random';

  if (topicMode === 'select') {
    const checked = document.querySelectorAll('.interview-topic-check:checked');
    if (checked.length === 0) {
      alert('Please select at least one topic');
      return;
    }
    selectedTopics = Array.from(checked).map(c => c.value);
  }

  // Get selected persona and role
  const personaId = document.getElementById('persona-select').value || null;
  const roleId = document.getElementById('role-select').value || null;

  showLoading('Starting interview...');

  try {
    const response = await fetch('/api/interview/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, selectedTopics, personaId, roleId })
    });

    if (!response.ok) throw new Error('Failed to start interview');

    const data = await response.json();
    interviewSession = data.sessionId;
    interviewMessages = [{ role: 'interviewer', content: data.message }];

    // Store interview context
    currentInterviewContext = {
      persona: data.persona,
      targetRole: data.targetRole,
      difficultyLevel: data.difficultyLevel || 2,
      questionCount: 1,
      currentTopic: data.currentTopic || null
    };

    // Show chat UI, hide setup and eligibility warning
    document.getElementById('interview-eligibility-warning').style.display = 'none';
    document.getElementById('interview-setup').style.display = 'none';
    document.getElementById('interview-chat').style.display = 'block';
    document.getElementById('interview-summary').style.display = 'none';

    // Start timer
    interviewStartTime = new Date();
    startInterviewTimer();

    // Update context badges
    updateInterviewContextBadges();

    renderChatMessages();
  } catch (error) {
    console.error('Failed to start interview:', error);
    alert('Failed to start interview. Please try again.');
  } finally {
    hideLoading();
  }
}

function updateInterviewContextBadges() {
  const personaBadge = document.getElementById('persona-badge');
  const personaBadgeText = document.getElementById('persona-badge-text');
  const roleBadge = document.getElementById('role-badge');
  const roleBadgeText = document.getElementById('role-badge-text');
  const difficultyLevel = document.getElementById('difficulty-level');
  const difficultyName = document.getElementById('difficulty-name');
  const topicBadge = document.getElementById('topic-badge');
  const topicBadgeText = document.getElementById('topic-badge-text');

  // Update persona badge
  if (currentInterviewContext.persona) {
    personaBadge.style.display = 'inline-block';
    personaBadgeText.textContent = currentInterviewContext.persona.name;
  } else {
    personaBadge.style.display = 'none';
  }

  // Update role badge
  if (currentInterviewContext.targetRole) {
    roleBadge.style.display = 'inline-block';
    roleBadgeText.textContent = currentInterviewContext.targetRole.name;
  } else {
    roleBadge.style.display = 'none';
  }

  // Update topic badge
  if (currentInterviewContext.currentTopic && topicBadge) {
    topicBadge.style.display = 'inline-block';
    topicBadgeText.textContent = currentInterviewContext.currentTopic.name || currentInterviewContext.currentTopic;
  } else if (topicBadge) {
    topicBadge.style.display = 'none';
  }

  // Update difficulty level
  const levelNames = { 1: 'Junior', 2: 'Mid-Level', 3: 'Senior', 4: 'Lead' };
  difficultyLevel.textContent = currentInterviewContext.difficultyLevel || 2;
  difficultyName.textContent = levelNames[currentInterviewContext.difficultyLevel] || 'Mid-Level';

  // Update difficulty badge color based on level
  const difficultyBadge = document.getElementById('difficulty-badge');
  const levelColors = { 1: 'bg-success', 2: 'bg-info', 3: 'bg-warning', 4: 'bg-danger' };
  difficultyBadge.className = `badge ${levelColors[currentInterviewContext.difficultyLevel] || 'bg-secondary'}`;

  // Update question count
  document.getElementById('question-count').textContent = currentInterviewContext.questionCount || 1;
}

function startInterviewTimer() {
  // Clear any existing timer
  if (interviewTimer) {
    clearInterval(interviewTimer);
  }

  // Update duration every second
  interviewTimer = setInterval(() => {
    if (!interviewStartTime) return;

    const now = new Date();
    const durationMs = now - interviewStartTime;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    document.getElementById('session-duration').textContent =
      `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopInterviewTimer() {
  if (interviewTimer) {
    clearInterval(interviewTimer);
    interviewTimer = null;
  }
}

async function sendInterviewResponse() {
  const input = document.getElementById('interview-input');
  const userMessage = input.value.trim();

  if (!userMessage || !interviewSession) return;

  // Add user message to chat
  interviewMessages.push({ role: 'user', content: userMessage });
  input.value = '';
  renderChatMessages();

  // Disable input while waiting
  input.disabled = true;
  document.getElementById('send-response-btn').disabled = true;

  try {
    const response = await fetch('/api/interview/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: interviewSession, message: userMessage })
    });

    if (!response.ok) throw new Error('Failed to get response');

    const data = await response.json();
    interviewMessages.push({ role: 'interviewer', content: data.message });

    // Update difficulty level if changed
    if (data.difficultyLevel && data.difficultyLevel !== currentInterviewContext.difficultyLevel) {
      currentInterviewContext.difficultyLevel = data.difficultyLevel;
    }

    // Update question count from metrics
    if (data.metrics && data.metrics.questionCount) {
      currentInterviewContext.questionCount = data.metrics.questionCount;
    }

    // Update current topic if provided
    if (data.currentTopic) {
      currentInterviewContext.currentTopic = data.currentTopic;
    }

    updateInterviewContextBadges();
    renderChatMessages();
  } catch (error) {
    console.error('Failed to send response:', error);
    interviewMessages.push({ role: 'interviewer', content: 'Sorry, there was an error. Please try again.' });
    renderChatMessages();
  } finally {
    input.disabled = false;
    document.getElementById('send-response-btn').disabled = false;
    input.focus();
  }
}

async function skipInterviewQuestion() {
  if (!interviewSession) return;

  // Send a skip message to the interviewer
  const skipMessage = "I'd like to skip this question and move to the next one.";

  // Add user message to chat
  interviewMessages.push({ role: 'user', content: skipMessage, skipped: true });
  renderChatMessages();

  // Disable input while waiting
  const input = document.getElementById('interview-input');
  input.disabled = true;
  document.getElementById('send-response-btn').disabled = true;
  document.getElementById('skip-interview-btn').disabled = true;

  try {
    const response = await fetch('/api/interview/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: interviewSession, message: skipMessage, skipped: true })
    });

    if (!response.ok) throw new Error('Failed to get response');

    const data = await response.json();

    // Check if session was auto-ended due to skip limit
    if (data.autoEnd) {
      interviewMessages.push({
        role: 'system',
        content: data.message
      });
      renderChatMessages();

      // Auto-end the interview after a brief delay
      setTimeout(() => {
        endInterview();
      }, 2000);
      return;
    }

    interviewMessages.push({ role: 'interviewer', content: data.message });

    // Update difficulty level if changed
    if (data.difficultyLevel && data.difficultyLevel !== currentInterviewContext.difficultyLevel) {
      currentInterviewContext.difficultyLevel = data.difficultyLevel;
    }

    // Update question count from metrics
    if (data.metrics && data.metrics.questionCount) {
      currentInterviewContext.questionCount = data.metrics.questionCount;
    }

    // Update current topic if provided
    if (data.currentTopic) {
      currentInterviewContext.currentTopic = data.currentTopic;
    }

    updateInterviewContextBadges();
    renderChatMessages();
  } catch (error) {
    console.error('Failed to skip question:', error);
    interviewMessages.push({ role: 'interviewer', content: "No problem, let's move on to the next question." });
    renderChatMessages();
  } finally {
    input.disabled = false;
    document.getElementById('send-response-btn').disabled = false;
    document.getElementById('skip-interview-btn').disabled = false;
    input.focus();
  }
}

async function endInterview() {
  if (!interviewSession) return;

  if (!confirm('Are you sure you want to end this interview?')) return;

  // Stop the timer
  stopInterviewTimer();

  showLoading('Generating summary...');

  try {
    const response = await fetch('/api/interview/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: interviewSession })
    });

    if (!response.ok) throw new Error('Failed to end interview');

    const summary = await response.json();
    displayInterviewSummary(summary);
  } catch (error) {
    console.error('Failed to end interview:', error);
    alert('Failed to generate summary. Please try again.');
  } finally {
    hideLoading();
  }
}

function displayInterviewSummary(summary) {
  document.getElementById('interview-eligibility-warning').style.display = 'none';
  document.getElementById('interview-setup').style.display = 'none';
  document.getElementById('interview-chat').style.display = 'none';
  document.getElementById('interview-summary').style.display = 'block';

  // Update summary badges
  const summaryBadges = document.getElementById('summary-badges');
  let badgesHtml = '';
  if (summary.persona) {
    badgesHtml += `<span class="badge bg-primary">${summary.persona.name}</span>`;
  }
  if (summary.targetRole) {
    badgesHtml += `<span class="badge bg-info">${summary.targetRole.name}</span>`;
  }
  // Add metrics badges
  if (summary.metrics) {
    badgesHtml += `<span class="badge bg-dark">Questions: ${summary.metrics.questionCount || 0}</span>`;
    if (summary.metrics.skippedCount > 0) {
      badgesHtml += `<span class="badge bg-warning text-dark">Skipped: ${summary.metrics.skippedCount}</span>`;
    }
    if (summary.metrics.duration) {
      badgesHtml += `<span class="badge bg-secondary">Duration: ${summary.metrics.duration.formatted}</span>`;
    }
  }
  summaryBadges.innerHTML = badgesHtml;

  const summaryContent = document.getElementById('summary-content');

  // Build score section
  let scoreSection = `
    <div class="row g-3 mb-4 text-center">
      <div class="col-md-${summary.roleFitScore ? '6' : '12'}">
        <div class="p-3 bg-light rounded">
          <h6 class="text-muted mb-2">Overall Score</h6>
          <span class="badge bg-primary fs-4">${summary.score}%</span>
        </div>
      </div>
  `;

  if (summary.roleFitScore !== undefined && summary.targetRole) {
    scoreSection += `
      <div class="col-md-6">
        <div class="p-3 bg-light rounded">
          <h6 class="text-muted mb-2">Role Fit: ${summary.targetRole.name}</h6>
          <span class="badge ${summary.roleFitScore >= 70 ? 'bg-success' : summary.roleFitScore >= 50 ? 'bg-warning' : 'bg-danger'} fs-4">${summary.roleFitScore}%</span>
        </div>
      </div>
    `;
  }
  scoreSection += '</div>';

  // Build difficulty progression section
  let difficultySection = '';
  if (summary.difficultyTracker) {
    const levelNames = { 1: 'Junior', 2: 'Mid-Level', 3: 'Senior', 4: 'Lead' };
    const startLevel = summary.difficultyTracker.adjustmentHistory?.[0]?.fromLevel || summary.difficultyTracker.currentLevel;
    const endLevel = summary.difficultyTracker.currentLevel;
    const adjustments = summary.difficultyTracker.adjustmentHistory?.length || 0;

    let progressionText = '';
    if (endLevel > startLevel) {
      progressionText = '<span class="text-success">Difficulty increased</span> during the interview - great job!';
    } else if (endLevel < startLevel) {
      progressionText = 'Difficulty was adjusted to better match your level.';
    } else {
      progressionText = 'Difficulty remained consistent throughout.';
    }

    difficultySection = `
      <div class="mb-3 p-3 bg-light rounded">
        <h6>Difficulty Progression</h6>
        <p class="mb-1">Started at: <strong>${levelNames[startLevel]}</strong> → Ended at: <strong>${levelNames[endLevel]}</strong></p>
        <p class="mb-0 small text-muted">${progressionText}</p>
      </div>
    `;
  }

  // Build role fit feedback section
  let roleFitSection = '';
  if (summary.roleFitFeedback && summary.targetRole) {
    roleFitSection = `
      <div class="mb-3">
        <h6>Role Fit Assessment</h6>
        <p>${summary.roleFitFeedback}</p>
      </div>
    `;
  }

  summaryContent.innerHTML = `
    ${scoreSection}

    <div class="mb-3">
      <h6>Overall Feedback</h6>
      <p>${summary.overallFeedback}</p>
    </div>

    ${difficultySection}

    ${roleFitSection}

    ${summary.topicsCovered?.length > 0 ? `
      <div class="mb-3">
        <h6>Topics Covered</h6>
        <div>${summary.topicsCovered.map(t => `<span class="badge bg-secondary me-1">${t}</span>`).join('')}</div>
      </div>
    ` : ''}

    ${summary.strengths?.length > 0 ? `
      <div class="mb-3">
        <h6 class="text-success">Strengths</h6>
        <ul>${summary.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>
    ` : ''}

    ${summary.areasToImprove?.length > 0 ? `
      <div class="mb-3">
        <h6 class="text-warning">Areas to Improve</h6>
        <ul>${summary.areasToImprove.map(a => `<li>${a}</li>`).join('')}</ul>
      </div>
    ` : ''}

    ${summary.recommendedNextSteps ? `
      <div class="mb-3 p-3 bg-primary bg-opacity-10 rounded">
        <h6>Recommended Next Steps</h6>
        <p class="mb-0">${summary.recommendedNextSteps}</p>
      </div>
    ` : ''}
  `;

  // Reload past interviews
  loadPastInterviews();
}

function resetInterview() {
  interviewSession = null;
  interviewMessages = [];
  currentInterviewContext = { persona: null, targetRole: null, difficultyLevel: 2, questionCount: 1, currentTopic: null };

  // Stop and reset timer
  stopInterviewTimer();
  interviewStartTime = null;

  // Reset selection dropdowns
  document.getElementById('persona-select').value = '';
  document.getElementById('role-select').value = '';
  document.getElementById('persona-description').textContent = '';
  document.getElementById('role-description').textContent = '';

  // Reset metrics display
  document.getElementById('question-count').textContent = '1';
  document.getElementById('session-duration').textContent = '0:00';

  document.getElementById('interview-chat').style.display = 'none';
  document.getElementById('interview-summary').style.display = 'none';
  document.getElementById('chat-messages').innerHTML = '';

  // Re-check eligibility to update topic availability and show setup
  checkInterviewEligibility();
}

function formatInterviewMessage(content) {
  // Convert newlines to <br> and preserve paragraph structure
  return content
    .replace(/\n\n/g, '</p><p>')  // Double newlines become paragraphs
    .replace(/\n/g, '<br>')        // Single newlines become line breaks
    .replace(/^/, '<p>')           // Wrap in paragraph tags
    .replace(/$/, '</p>')
    .replace(/<p><\/p>/g, '')      // Remove empty paragraphs
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
    .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
    .replace(/`(.*?)`/g, '<code>$1</code>');           // Code
}

function renderChatMessages() {
  const chatContainer = document.getElementById('chat-messages');
  chatContainer.innerHTML = interviewMessages.map(msg => {
    if (msg.role === 'system') {
      return `
        <div class="chat-message system mb-3">
          <div class="alert alert-warning mb-0">
            ${formatInterviewMessage(msg.content)}
          </div>
        </div>
      `;
    }
    return `
      <div class="chat-message ${msg.role === 'interviewer' ? 'interviewer' : 'user'} mb-3">
        <div class="chat-bubble ${msg.role === 'interviewer' ? 'bg-light' : 'bg-primary text-white'} p-3 rounded">
          ${formatInterviewMessage(msg.content)}
        </div>
        <small class="text-muted">${msg.role === 'interviewer' ? 'Interviewer' : 'You'}</small>
      </div>
    `;
  }).join('');

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function loadPastInterviews() {
  try {
    const response = await fetch(`/api/interview/sessions?courseId=${courseId}`);
    const sessions = await response.json();

    const container = document.getElementById('past-interviews');

    // Update interview stats
    updateInterviewStats(sessions);

    if (!sessions || sessions.length === 0) {
      container.innerHTML = '<p class="text-muted text-center py-3">No past interviews yet. Start an interview to see your history here.</p>';
      return;
    }

    container.innerHTML = sessions.map(session => {
      const date = new Date(session.endTime || session.startTime);
      const score = session.summary?.score || 0;

      // Build badges for persona and role
      let badges = '';
      if (session.persona) {
        badges += `<span class="badge bg-primary me-1">${session.persona.name}</span>`;
      }
      if (session.targetRole) {
        badges += `<span class="badge bg-info me-1">${session.targetRole.name}</span>`;
      }

      // Build topic info
      const topicInfo = session.selectedTopics === 'random' ? 'Random topics' : `${session.selectedTopics?.length || 0} topics`;

      // Build metrics badges
      let metricsBadges = '';
      if (session.metrics) {
        if (session.metrics.questionCount) {
          metricsBadges += `<span class="badge bg-dark me-1">${session.metrics.questionCount} Qs</span>`;
        }
        if (session.metrics.skippedCount > 0) {
          metricsBadges += `<span class="badge bg-warning text-dark me-1">${session.metrics.skippedCount} skipped</span>`;
        }
        if (session.metrics.duration?.formatted) {
          metricsBadges += `<span class="badge bg-secondary me-1">${session.metrics.duration.formatted}</span>`;
        }
      }

      // Determine score color
      const scoreClass = score >= 70 ? 'bg-success' : score >= 50 ? 'bg-warning text-dark' : 'bg-danger';
      const borderClass = score >= 70 ? 'border-success' : score >= 50 ? 'border-warning' : 'border-danger';

      // Build strengths/improvements preview
      let feedbackPreview = '';
      if (session.summary?.strengths?.length > 0) {
        feedbackPreview += `<small class="text-success d-block">+ ${session.summary.strengths[0]}</small>`;
      }
      if (session.summary?.areasToImprove?.length > 0) {
        feedbackPreview += `<small class="text-warning d-block">- ${session.summary.areasToImprove[0]}</small>`;
      }

      return `
        <div class="card mb-3 interview-history-card ${borderClass}" style="border-left: 4px solid;">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center mb-2">
                  <span class="fw-medium me-2">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>
                  <span class="badge ${scoreClass} fs-6">${score}%</span>
                  ${session.summary?.roleFitScore !== undefined ? `<span class="badge bg-outline-secondary ms-1">Fit: ${session.summary.roleFitScore}%</span>` : ''}
                </div>
                <div class="mb-2">
                  ${badges}
                  ${metricsBadges}
                </div>
                <div class="small text-muted mb-2">${topicInfo}</div>
                ${feedbackPreview}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load past interviews:', error);
  }
}

function updateInterviewStats(sessions) {
  if (!sessions || sessions.length === 0) {
    document.getElementById('interview-stat-total').textContent = '0';
    document.getElementById('interview-stat-avg').textContent = '0%';
    document.getElementById('interview-stat-questions').textContent = '0';
    document.getElementById('interview-stat-time').textContent = '0:00';
    return;
  }

  // Calculate stats
  const totalInterviews = sessions.length;
  let totalScore = 0;
  let totalQuestions = 0;
  let totalMinutes = 0;

  sessions.forEach(session => {
    totalScore += session.summary?.score || 0;
    totalQuestions += session.metrics?.questionCount || 0;
    if (session.metrics?.duration) {
      totalMinutes += session.metrics.duration.minutes || 0;
      totalMinutes += (session.metrics.duration.seconds || 0) / 60;
    }
  });

  const avgScore = Math.round(totalScore / totalInterviews);
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  const timeDisplay = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Update UI
  document.getElementById('interview-stat-total').textContent = totalInterviews;
  document.getElementById('interview-stat-avg').textContent = `${avgScore}%`;
  document.getElementById('interview-stat-questions').textContent = totalQuestions;
  document.getElementById('interview-stat-time').textContent = timeDisplay;
}

async function clearInterviewHistory() {
  if (!confirm('Are you sure you want to clear all interview history for this course?')) return;

  try {
    const response = await fetch(`/api/interview/sessions/course/${courseId}`, { method: 'DELETE' });
    if (response.ok) {
      await loadPastInterviews();
    } else {
      alert('Failed to clear interview history');
    }
  } catch (error) {
    console.error('Failed to clear interview history:', error);
    alert('Failed to clear interview history');
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function showLoading(message) {
  document.getElementById('loading-text').textContent = message;
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
