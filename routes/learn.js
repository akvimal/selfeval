const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { callGroq } = require('../services/groq');
const { getLessonStartPrompt, getLessonContinuePrompt, getLessonHintPrompt } = require('../prompts/templates');

// All learn routes require authentication
router.use(requireAuth);

// In-memory storage for active lessons
const activeLessons = new Map();

// Lesson progress storage (in-memory, could be moved to file)
const lessonProgress = {};

// Generate unique session ID
function generateSessionId() {
  return `lesson_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// GET /api/learn/test - Test endpoint
router.get('/test', (req, res) => {
  res.json({ status: 'Learn API is working' });
});

// POST /api/learn/start - Start a new lesson
router.post('/start', async (req, res) => {
  try {
    console.log('Starting lesson with body:', req.body);
    const { courseId, topicId, topicName, subtopic, subtopicIndex, courseName } = req.body;

    if (!courseId || !topicId || !subtopic) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'courseId, topicId, and subtopic are required' });
    }

    const sessionId = generateSessionId();
    console.log('Session ID:', sessionId);

    // Create the lesson session
    const session = {
      id: sessionId,
      courseId,
      courseName,
      topicId,
      topicName,
      subtopic,
      subtopicIndex,
      step: 1,
      messages: [],
      startTime: new Date().toISOString()
    };

    // Generate the initial lesson content
    console.log('Generating lesson content for:', subtopic);
    const prompt = getLessonStartPrompt(courseName, topicName, subtopic);
    console.log('Calling Groq API...');
    const response = await callGroq(prompt);
    console.log('Groq response received:', typeof response, response);

    // Response is already parsed JSON from callGroq
    let message = response.content || response.message || JSON.stringify(response);
    session.step = response.step || 1;

    session.messages.push({ role: 'assistant', content: message });
    activeLessons.set(sessionId, session);

    res.json({
      sessionId,
      message,
      step: session.step
    });

  } catch (error) {
    console.error('Error starting lesson:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: 'Failed to start lesson: ' + error.message });
  }
});

// POST /api/learn/respond - Continue the lesson with user response
router.post('/respond', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const session = activeLessons.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Lesson session not found' });
    }

    // Add user message
    session.messages.push({ role: 'user', content: message });

    // Generate tutor response
    const prompt = getLessonContinuePrompt(
      session.courseName,
      session.topicName,
      session.subtopic,
      session.step,
      session.messages
    );

    const response = await callGroq(prompt);

    // Response is already parsed JSON from callGroq
    let tutorMessage = response.content || response.message || JSON.stringify(response);
    let newStep = response.step || session.step;
    let completed = response.completed || false;

    session.step = newStep;
    session.messages.push({ role: 'assistant', content: tutorMessage });

    // If completed, save progress
    if (completed) {
      const progressKey = `${session.courseId}`;
      if (!lessonProgress[progressKey]) {
        lessonProgress[progressKey] = {};
      }
      lessonProgress[progressKey][`${session.topicId}:${session.subtopicIndex}`] = {
        completed: true,
        completedAt: new Date().toISOString()
      };
    }

    res.json({
      message: tutorMessage,
      step: newStep,
      completed
    });

  } catch (error) {
    console.error('Error in lesson response:', error);
    res.status(500).json({ error: 'Failed to get response: ' + error.message });
  }
});

// POST /api/learn/hint - Get a hint for the current question
router.post('/hint', async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = activeLessons.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Lesson session not found' });
    }

    const prompt = getLessonHintPrompt(
      session.subtopic,
      session.step,
      session.messages
    );

    const response = await callGroq(prompt);

    // Response is already parsed JSON from callGroq
    let hint = response.hint || response.content || JSON.stringify(response);

    res.json({ hint });

  } catch (error) {
    console.error('Error getting hint:', error);
    res.status(500).json({ error: 'Failed to get hint' });
  }
});

// POST /api/learn/end - End a lesson
router.post('/end', async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = activeLessons.get(sessionId);
    if (session) {
      activeLessons.delete(sessionId);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Error ending lesson:', error);
    res.status(500).json({ error: 'Failed to end lesson' });
  }
});

// GET /api/learn/progress/:courseId - Get lesson progress for a course
router.get('/progress/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const progress = lessonProgress[courseId] || {};
    res.json(progress);
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

module.exports = router;
