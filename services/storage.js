const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COURSES_FILE = path.join(DATA_DIR, 'courses.json');
const PERFORMANCE_FILE = path.join(DATA_DIR, 'performance.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const INTERVIEWS_FILE = path.join(DATA_DIR, 'interviews.json');
const PERSONAS_FILE = path.join(DATA_DIR, 'personas.json');
const ROLES_FILE = path.join(DATA_DIR, 'roles.json');

// In-memory interview session storage (for active sessions)
const activeSessions = new Map();

// Course functions
async function getCourses() {
  const data = await fs.readFile(COURSES_FILE, 'utf-8');
  return JSON.parse(data);
}

async function getCourse(courseId) {
  const data = await getCourses();
  return data.courses.find(c => c.id === courseId);
}

async function getTopic(courseId, topicId) {
  const course = await getCourse(courseId);
  if (!course) return null;
  return course.topics.find(t => t.id === topicId);
}

async function saveCourses(data) {
  await fs.writeFile(COURSES_FILE, JSON.stringify(data, null, 2));
}

// Course CRUD
async function createCourse(course) {
  const data = await getCourses();

  // Generate ID if not provided
  if (!course.id) {
    course.id = course.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  // Check for duplicate ID
  if (data.courses.find(c => c.id === course.id)) {
    throw new Error('Course with this ID already exists');
  }

  // Ensure topics array exists
  if (!course.topics) {
    course.topics = [];
  }

  data.courses.push(course);
  await saveCourses(data);
  return course;
}

async function updateCourse(courseId, updates) {
  const data = await getCourses();
  const index = data.courses.findIndex(c => c.id === courseId);

  if (index === -1) {
    throw new Error('Course not found');
  }

  // Don't allow changing the ID
  delete updates.id;

  data.courses[index] = { ...data.courses[index], ...updates };
  await saveCourses(data);
  return data.courses[index];
}

async function deleteCourse(courseId) {
  const data = await getCourses();
  const index = data.courses.findIndex(c => c.id === courseId);

  if (index === -1) {
    throw new Error('Course not found');
  }

  const deleted = data.courses.splice(index, 1)[0];
  await saveCourses(data);
  return deleted;
}

// Topic CRUD
async function createTopic(courseId, topic) {
  const data = await getCourses();
  const course = data.courses.find(c => c.id === courseId);

  if (!course) {
    throw new Error('Course not found');
  }

  // Generate ID if not provided
  if (!topic.id) {
    topic.id = topic.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  // Check for duplicate ID
  if (course.topics.find(t => t.id === topic.id)) {
    throw new Error('Topic with this ID already exists in this course');
  }

  // Ensure subtopics array exists
  if (!topic.subtopics) {
    topic.subtopics = [];
  }

  course.topics.push(topic);
  await saveCourses(data);
  return topic;
}

async function updateTopic(courseId, topicId, updates) {
  const data = await getCourses();
  const course = data.courses.find(c => c.id === courseId);

  if (!course) {
    throw new Error('Course not found');
  }

  const index = course.topics.findIndex(t => t.id === topicId);

  if (index === -1) {
    throw new Error('Topic not found');
  }

  // Don't allow changing the ID
  delete updates.id;

  course.topics[index] = { ...course.topics[index], ...updates };
  await saveCourses(data);
  return course.topics[index];
}

async function deleteTopic(courseId, topicId) {
  const data = await getCourses();
  const course = data.courses.find(c => c.id === courseId);

  if (!course) {
    throw new Error('Course not found');
  }

  const index = course.topics.findIndex(t => t.id === topicId);

  if (index === -1) {
    throw new Error('Topic not found');
  }

  const deleted = course.topics.splice(index, 1)[0];
  await saveCourses(data);
  return deleted;
}

// Performance functions
async function getPerformance() {
  const data = await fs.readFile(PERFORMANCE_FILE, 'utf-8');
  return JSON.parse(data);
}

async function savePerformance(performance) {
  await fs.writeFile(PERFORMANCE_FILE, JSON.stringify(performance, null, 2));
}

async function updatePerformance(courseId, courseName, topicId, topicName, questionType, score, isCorrect, questionData) {
  const performance = await getPerformance();

  // Update overall
  performance.overall.totalQuestions++;
  if (isCorrect) {
    performance.overall.correctAnswers++;
  }
  performance.overall.totalScore += score;
  performance.overall.averageScore = Math.round(
    performance.overall.totalScore / performance.overall.totalQuestions
  );

  // Update by course
  if (!performance.byCourse[courseId]) {
    performance.byCourse[courseId] = {
      name: courseName,
      attempts: 0,
      correct: 0,
      totalScore: 0,
      averageScore: 0,
      topics: {},
      byType: {}
    };
  }
  const course = performance.byCourse[courseId];
  course.attempts++;
  if (isCorrect) {
    course.correct++;
  }
  course.totalScore += score;
  course.averageScore = Math.round(course.totalScore / course.attempts);

  // Update question type within course
  const typeKey = questionType.toLowerCase().replace(/[^a-z]/g, '');
  if (!course.byType) {
    course.byType = {};
  }
  if (!course.byType[typeKey]) {
    course.byType[typeKey] = {
      attempts: 0,
      correct: 0,
      totalScore: 0
    };
  }
  course.byType[typeKey].attempts++;
  if (isCorrect) {
    course.byType[typeKey].correct++;
  }
  course.byType[typeKey].totalScore += score;

  // Update topic within course
  const topicKey = `${courseId}:${topicId}`;
  if (!course.topics[topicId]) {
    course.topics[topicId] = {
      name: topicName,
      attempts: 0,
      correct: 0,
      totalScore: 0,
      averageScore: 0
    };
  }
  const topic = course.topics[topicId];
  topic.attempts++;
  if (isCorrect) {
    topic.correct++;
  }
  topic.totalScore += score;
  topic.averageScore = Math.round(topic.totalScore / topic.attempts);

  // Update global topic stats
  if (!performance.byTopic[topicKey]) {
    performance.byTopic[topicKey] = {
      courseId,
      courseName,
      topicId,
      name: topicName,
      attempts: 0,
      correct: 0,
      totalScore: 0,
      averageScore: 0
    };
  }
  const globalTopic = performance.byTopic[topicKey];
  globalTopic.attempts++;
  if (isCorrect) {
    globalTopic.correct++;
  }
  globalTopic.totalScore += score;
  globalTopic.averageScore = Math.round(globalTopic.totalScore / globalTopic.attempts);

  // Update by question type (global) - typeKey already defined above
  if (performance.byQuestionType[typeKey]) {
    performance.byQuestionType[typeKey].attempts++;
    if (isCorrect) {
      performance.byQuestionType[typeKey].correct++;
    }
    performance.byQuestionType[typeKey].totalScore += score;
  }

  // Add to recent activity (keep last 20)
  performance.recentActivity.unshift({
    timestamp: new Date().toISOString(),
    courseId,
    courseName,
    topicId,
    topicName,
    questionType,
    score,
    isCorrect,
    question: questionData.question
  });
  performance.recentActivity = performance.recentActivity.slice(0, 20);

  await savePerformance(performance);
  return performance;
}

async function resetPerformance() {
  const initial = {
    overall: {
      totalQuestions: 0,
      correctAnswers: 0,
      totalScore: 0,
      averageScore: 0
    },
    byCourse: {},
    byTopic: {},
    byQuestionType: {
      mcq: { attempts: 0, correct: 0, totalScore: 0 },
      truefalse: { attempts: 0, correct: 0, totalScore: 0 },
      concept: { attempts: 0, correct: 0, totalScore: 0 },
      comparison: { attempts: 0, correct: 0, totalScore: 0 },
      fillblank: { attempts: 0, correct: 0, totalScore: 0 }
    },
    recentActivity: []
  };
  await savePerformance(initial);
  return initial;
}

async function getCoursePerformance(courseId) {
  const performance = await getPerformance();
  return performance.byCourse[courseId] || null;
}

// History functions
async function getHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { questions: [] };
  }
}

async function saveHistory(history) {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
}

async function addToHistory(questionData, userAnswer, result) {
  const history = await getHistory();

  const historyEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    question: questionData,
    userAnswer,
    result: {
      score: result.score,
      isCorrect: result.isCorrect,
      feedback: result.feedback,
      strengths: result.strengths,
      missingPoints: result.missingPoints
    }
  };

  history.questions.unshift(historyEntry);
  history.questions = history.questions.slice(0, 100);

  await saveHistory(history);
  return historyEntry;
}

async function getHistoryByCourse(courseId) {
  const history = await getHistory();
  return history.questions.filter(q => q.question.courseId === courseId);
}

async function getHistoryByTopic(courseId, topicId) {
  const history = await getHistory();
  return history.questions.filter(q =>
    q.question.courseId === courseId && q.question.topicId === topicId
  );
}

async function getIncorrectQuestions() {
  const history = await getHistory();
  return history.questions.filter(q => !q.result.isCorrect);
}

async function clearHistory() {
  await saveHistory({ questions: [] });
  return { questions: [] };
}

async function clearHistoryByCourse(courseId) {
  const history = await getHistory();
  history.questions = history.questions.filter(q => q.question.courseId !== courseId);
  await saveHistory(history);
  return history;
}

// ============================================================
// PERSONA FUNCTIONS
// ============================================================

async function getPersonas() {
  try {
    const data = await fs.readFile(PERSONAS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { personas: [] };
  }
}

async function getPersona(personaId) {
  const data = await getPersonas();
  return data.personas.find(p => p.id === personaId);
}

// ============================================================
// ROLE FUNCTIONS
// ============================================================

async function getRoles() {
  try {
    const data = await fs.readFile(ROLES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { genericRoles: [], courseRoles: {} };
  }
}

async function getGenericRoles() {
  const data = await getRoles();
  return data.genericRoles || [];
}

async function getCourseRoles(courseId) {
  const data = await getRoles();
  return data.courseRoles?.[courseId] || [];
}

async function getRole(roleId, courseId = null) {
  const data = await getRoles();

  // Check generic roles first
  const genericRole = data.genericRoles.find(r => r.id === roleId);
  if (genericRole) return { ...genericRole, type: 'generic' };

  // Check course-specific roles
  if (courseId && data.courseRoles?.[courseId]) {
    const courseRole = data.courseRoles[courseId].find(r => r.id === roleId);
    if (courseRole) return { ...courseRole, type: 'course-specific' };
  }

  return null;
}

// ============================================================
// INTERVIEW FUNCTIONS
// ============================================================

async function getInterviews() {
  try {
    const data = await fs.readFile(INTERVIEWS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { sessions: [] };
  }
}

async function saveInterviews(data) {
  await fs.writeFile(INTERVIEWS_FILE, JSON.stringify(data, null, 2));
}

function createInterviewSession(courseId, courseName, selectedTopics, topics, persona = null, role = null) {
  const sessionId = `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Determine initial difficulty level based on role
  let initialLevel = 2; // Default to mid-level
  if (role) {
    if (role.level) {
      initialLevel = role.level;
    } else if (role.baseLevel) {
      // Map baseLevel string to number
      const levelMap = { junior: 1, mid: 2, senior: 3, lead: 4 };
      initialLevel = levelMap[role.baseLevel] || 2;
    }
  }

  const session = {
    id: sessionId,
    courseId,
    courseName,
    selectedTopics,
    topics, // Store topic details for context
    // Persona and role info
    persona: persona ? {
      id: persona.id,
      name: persona.name,
      style: persona.style,
      focusAreas: persona.focusAreas,
      evaluationWeight: persona.evaluationWeight
    } : null,
    targetRole: role ? {
      id: role.id,
      name: role.name,
      level: role.level || initialLevel,
      type: role.type || 'generic',
      expectations: role.expectations,
      focusTopics: role.focusTopics
    } : null,
    // Difficulty tracking
    difficultyTracker: {
      currentLevel: initialLevel,
      recentAssessments: [], // Last 3: 'excellent', 'good', 'partial', 'brief'
      adjustmentHistory: []
    },
    // Session metrics
    metrics: {
      questionCount: 0,
      skippedCount: 0
    },
    startTime: new Date().toISOString(),
    endTime: null,
    messages: [],
    summary: null
  };

  activeSessions.set(sessionId, session);
  return session;
}

function getActiveSession(sessionId) {
  return activeSessions.get(sessionId);
}

function addMessageToSession(sessionId, role, content, metadata = {}) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  session.messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
    ...metadata
  });

  return session;
}

// Difficulty tracking functions
function updateDifficultyAssessment(sessionId, assessment) {
  const session = activeSessions.get(sessionId);
  if (!session || !session.difficultyTracker) return null;

  const tracker = session.difficultyTracker;
  const validAssessments = ['excellent', 'good', 'partial', 'brief'];

  if (!validAssessments.includes(assessment)) {
    console.warn(`Invalid assessment: ${assessment}`);
    return session;
  }

  // Add to recent assessments (keep last 3)
  tracker.recentAssessments.push(assessment);
  if (tracker.recentAssessments.length > 3) {
    tracker.recentAssessments.shift();
  }

  // Check if difficulty adjustment is needed
  const adjustmentResult = checkDifficultyAdjustment(tracker);

  if (adjustmentResult.shouldAdjust) {
    const previousLevel = tracker.currentLevel;
    tracker.currentLevel = Math.max(1, Math.min(4, tracker.currentLevel + adjustmentResult.direction));

    tracker.adjustmentHistory.push({
      timestamp: new Date().toISOString(),
      fromLevel: previousLevel,
      toLevel: tracker.currentLevel,
      reason: adjustmentResult.reason
    });

    // Reset recent assessments after adjustment
    tracker.recentAssessments = [];
  }

  return session;
}

function checkDifficultyAdjustment(tracker) {
  const recent = tracker.recentAssessments;

  // Need at least 2 assessments to consider adjustment
  if (recent.length < 2) {
    return { shouldAdjust: false };
  }

  // Count assessment types
  const excellentCount = recent.filter(a => a === 'excellent').length;
  const goodCount = recent.filter(a => a === 'good').length;
  const partialCount = recent.filter(a => a === 'partial').length;
  const briefCount = recent.filter(a => a === 'brief').length;

  // Increase difficulty: 2+ excellent answers
  if (excellentCount >= 2) {
    if (tracker.currentLevel < 4) {
      return {
        shouldAdjust: true,
        direction: 1,
        reason: 'Candidate showing strong performance - increasing difficulty'
      };
    }
  }

  // Decrease difficulty: 2+ brief/partial answers
  if (briefCount >= 2 || (briefCount + partialCount) >= 2) {
    if (tracker.currentLevel > 1) {
      return {
        shouldAdjust: true,
        direction: -1,
        reason: 'Candidate may need support - decreasing difficulty'
      };
    }
  }

  return { shouldAdjust: false };
}

function getDifficultyLevel(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || !session.difficultyTracker) return 2;
  return session.difficultyTracker.currentLevel;
}

function getDifficultyContext(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || !session.difficultyTracker) {
    return {
      currentLevel: 2,
      levelName: 'Mid-Level',
      recentAssessments: []
    };
  }

  const levelNames = {
    1: 'Junior',
    2: 'Mid-Level',
    3: 'Senior',
    4: 'Lead'
  };

  return {
    currentLevel: session.difficultyTracker.currentLevel,
    levelName: levelNames[session.difficultyTracker.currentLevel] || 'Mid-Level',
    recentAssessments: session.difficultyTracker.recentAssessments
  };
}

// Session metrics functions
function incrementQuestionCount(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  if (!session.metrics) {
    session.metrics = { questionCount: 0, skippedCount: 0 };
  }
  session.metrics.questionCount++;
  return session;
}

function incrementSkippedCount(sessionId, topicId = null) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  if (!session.metrics) {
    session.metrics = { questionCount: 0, skippedCount: 0, skipsPerTopic: {} };
  }
  if (!session.metrics.skipsPerTopic) {
    session.metrics.skipsPerTopic = {};
  }

  session.metrics.skippedCount++;

  // Track per-topic skips if topic provided
  if (topicId) {
    session.metrics.skipsPerTopic[topicId] = (session.metrics.skipsPerTopic[topicId] || 0) + 1;
  }

  return session;
}

function getMaxTopicSkips(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || !session.metrics || !session.metrics.skipsPerTopic) {
    return { maxSkips: 0, topicId: null, topicName: null };
  }

  let maxSkips = 0;
  let maxTopicId = null;

  for (const [topicId, count] of Object.entries(session.metrics.skipsPerTopic)) {
    if (count > maxSkips) {
      maxSkips = count;
      maxTopicId = topicId;
    }
  }

  return { maxSkips, topicId: maxTopicId };
}

function getSessionMetrics(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  const startTime = new Date(session.startTime);
  const now = new Date();
  const durationMs = now - startTime;
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);

  return {
    questionCount: session.metrics?.questionCount || 0,
    skippedCount: session.metrics?.skippedCount || 0,
    duration: {
      minutes: durationMinutes,
      seconds: durationSeconds,
      formatted: `${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`
    }
  };
}

async function endInterviewSession(sessionId, summary) {
  const session = activeSessions.get(sessionId);
  if (!session) return null;

  session.endTime = new Date().toISOString();
  session.summary = summary;

  // Also save metrics at session level for easier access
  if (summary.metrics) {
    session.metrics = summary.metrics;
  }

  // Save to file
  const interviews = await getInterviews();
  interviews.sessions.unshift(session);
  interviews.sessions = interviews.sessions.slice(0, 50); // Keep last 50 sessions
  await saveInterviews(interviews);

  // Remove from active sessions
  activeSessions.delete(sessionId);

  return session;
}

async function getInterviewsByCourse(courseId) {
  const interviews = await getInterviews();
  return interviews.sessions.filter(s => s.courseId === courseId);
}

async function getInterviewSession(sessionId) {
  // Check active sessions first
  if (activeSessions.has(sessionId)) {
    return activeSessions.get(sessionId);
  }

  // Check saved sessions
  const interviews = await getInterviews();
  return interviews.sessions.find(s => s.id === sessionId);
}

async function clearInterviewsByCourse(courseId) {
  const interviews = await getInterviews();
  interviews.sessions = interviews.sessions.filter(s => s.courseId !== courseId);
  await saveInterviews(interviews);
}

module.exports = {
  getCourses,
  getCourse,
  getTopic,
  createCourse,
  updateCourse,
  deleteCourse,
  createTopic,
  updateTopic,
  deleteTopic,
  getPerformance,
  savePerformance,
  updatePerformance,
  resetPerformance,
  getCoursePerformance,
  getHistory,
  addToHistory,
  getHistoryByCourse,
  getHistoryByTopic,
  getIncorrectQuestions,
  clearHistory,
  clearHistoryByCourse,
  // Persona functions
  getPersonas,
  getPersona,
  // Role functions
  getRoles,
  getGenericRoles,
  getCourseRoles,
  getRole,
  // Interview functions
  getInterviews,
  createInterviewSession,
  getActiveSession,
  addMessageToSession,
  endInterviewSession,
  getInterviewsByCourse,
  getInterviewSession,
  clearInterviewsByCourse,
  // Difficulty tracking
  updateDifficultyAssessment,
  getDifficultyLevel,
  getDifficultyContext,
  // Session metrics
  incrementQuestionCount,
  incrementSkippedCount,
  getMaxTopicSkips,
  getSessionMetrics
};
