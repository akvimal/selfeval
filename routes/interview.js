const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const storage = require('../services/storage');
const groq = require('../services/groq');
const { getSetting, getPerformanceByCourse, getInterviews } = require('../services/database');

const MAX_SKIPS_BEFORE_END = 3;

// Helper to get today's interview question count for a user
async function getTodayQuestionCount(userId) {
  const interviews = await getInterviews(userId, null, 50);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalQuestions = 0;
  for (const interview of interviews) {
    const interviewDate = new Date(interview.start_time);
    if (interviewDate >= today) {
      // Count questions from today's interviews
      totalQuestions += interview.summary?.metrics?.questionCount || 0;
    }
  }

  // Also add questions from active sessions (not yet ended)
  // This is tracked separately in active sessions
  return totalQuestions;
}

// All interview routes require authentication
router.use(requireAuth);

// Check interview eligibility for a course
router.get('/eligibility/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // Get settings
    const minQuestionsPerTopicStr = await getSetting('interview_min_questions');
    const minScoreStr = await getSetting('interview_min_score');
    const dailyLimitStr = await getSetting('interview_daily_question_limit');

    const minQuestionsPerTopic = parseInt(minQuestionsPerTopicStr) || 0;
    const minScore = parseInt(minScoreStr) || 0;
    const dailyLimit = parseInt(dailyLimitStr) || 50;

    // Get course to get topic list
    const course = await storage.getCourse(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Get user's performance for this course
    const performance = await getPerformanceByCourse(userId, courseId);

    // Aggregate performance by topic
    const topicProgress = {};
    course.topics.forEach(topic => {
      topicProgress[topic.id] = {
        id: topic.id,
        name: topic.name,
        questionsAnswered: 0,
        totalScore: 0,
        avgScore: 0,
        meetsRequirement: minQuestionsPerTopic === 0
      };
    });

    performance.forEach(p => {
      if (topicProgress[p.topic_id]) {
        topicProgress[p.topic_id].questionsAnswered++;
        topicProgress[p.topic_id].totalScore += p.score;
      }
    });

    // Calculate averages and check requirements
    const topicsEligible = [];
    const topicsNotMeeting = [];

    Object.values(topicProgress).forEach(topic => {
      if (topic.questionsAnswered > 0) {
        topic.avgScore = Math.round(topic.totalScore / topic.questionsAnswered);
      }
      topic.meetsRequirement = minQuestionsPerTopic === 0 || topic.questionsAnswered >= minQuestionsPerTopic;

      if (topic.meetsRequirement) {
        topicsEligible.push({
          id: topic.id,
          name: topic.name,
          questionsAnswered: topic.questionsAnswered,
          avgScore: topic.avgScore
        });
      } else {
        topicsNotMeeting.push({
          id: topic.id,
          name: topic.name,
          current: topic.questionsAnswered,
          required: minQuestionsPerTopic
        });
      }
    });

    // At least one topic must be eligible (or no requirements set)
    const hasEligibleTopics = minQuestionsPerTopic === 0 || topicsEligible.length > 0;

    // Overall stats
    const totalQuestionsAttempted = performance.length;
    let overallAvgScore = 0;
    if (totalQuestionsAttempted > 0) {
      const totalScore = performance.reduce((sum, p) => sum + p.score, 0);
      overallAvgScore = Math.round(totalScore / totalQuestionsAttempted);
    }

    // Get today's question count
    const todayQuestionCount = await getTodayQuestionCount(userId);

    const meetsQuestionRequirement = hasEligibleTopics;
    const meetsScoreRequirement = minScore === 0 || overallAvgScore >= minScore;
    const withinDailyLimit = todayQuestionCount < dailyLimit;
    const eligible = meetsQuestionRequirement && meetsScoreRequirement && withinDailyLimit;

    res.json({
      eligible,
      requirements: { minQuestionsPerTopic, minScore, dailyLimit },
      current: {
        totalQuestions: totalQuestionsAttempted,
        avgScore: overallAvgScore,
        todayQuestionCount
      },
      topicProgress: Object.values(topicProgress),
      topicsEligible,
      topicsNotMeeting,
      meetsQuestionRequirement,
      meetsScoreRequirement,
      withinDailyLimit,
      dailyLimitRemaining: Math.max(0, dailyLimit - todayQuestionCount)
    });

  } catch (error) {
    console.error('Error checking interview eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// Get all available personas
router.get('/personas', async (req, res) => {
  try {
    const data = await storage.getPersonas();
    res.json(data.personas || []);
  } catch (error) {
    console.error('Error getting personas:', error);
    res.status(500).json({ error: 'Failed to get personas' });
  }
});

// Get all roles (generic + course-specific if courseId provided)
router.get('/roles', async (req, res) => {
  try {
    const { courseId } = req.query;
    const data = await storage.getRoles();

    const result = {
      genericRoles: data.genericRoles || [],
      courseRoles: courseId ? (data.courseRoles?.[courseId] || []) : []
    };

    res.json(result);
  } catch (error) {
    console.error('Error getting roles:', error);
    res.status(500).json({ error: 'Failed to get roles' });
  }
});

// Start a new interview session
router.post('/start', async (req, res) => {
  try {
    const { courseId, selectedTopics, personaId, roleId } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: 'Course ID is required' });
    }

    // Get course data first (needed for topic checks)
    const course = await storage.getCourse(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check eligibility before starting
    const minQuestionsPerTopicStr = await getSetting('interview_min_questions');
    const minScoreStr = await getSetting('interview_min_score');
    const dailyLimitStr = await getSetting('interview_daily_question_limit');
    const minQuestionsPerTopic = parseInt(minQuestionsPerTopicStr) || 0;
    const minScore = parseInt(minScoreStr) || 0;
    const dailyLimit = parseInt(dailyLimitStr) || 50;

    // Check daily limit
    const todayQuestionCount = await getTodayQuestionCount(req.user.id);
    if (todayQuestionCount >= dailyLimit) {
      return res.status(403).json({
        error: `You've reached your daily interview question limit of ${dailyLimit}. Try again tomorrow.`,
        eligible: false,
        dailyLimitReached: true
      });
    }

    // Get performance and calculate eligible topics
    const performance = await getPerformanceByCourse(req.user.id, courseId);

    // Calculate which topics are eligible
    const topicCounts = {};
    course.topics.forEach(t => { topicCounts[t.id] = 0; });
    performance.forEach(p => {
      if (topicCounts[p.topic_id] !== undefined) {
        topicCounts[p.topic_id]++;
      }
    });

    const eligibleTopicIds = course.topics
      .filter(t => minQuestionsPerTopic === 0 || topicCounts[t.id] >= minQuestionsPerTopic)
      .map(t => t.id);

    if (eligibleTopicIds.length === 0) {
      return res.status(403).json({
        error: `You need to practice at least ${minQuestionsPerTopic} questions in at least one topic before starting an interview.`,
        eligible: false
      });
    }

    // Check average score
    if (minScore > 0) {
      let avgScore = 0;
      if (performance.length > 0) {
        const totalScore = performance.reduce((sum, p) => sum + p.score, 0);
        avgScore = Math.round(totalScore / performance.length);
      }

      if (avgScore < minScore) {
        return res.status(403).json({
          error: `You need an average score of at least ${minScore}% in practice before starting an interview. Current: ${avgScore}%`,
          eligible: false
        });
      }
    }

    // Determine which topics to use (only from eligible topics)
    let topics;
    if (selectedTopics === 'random' || !selectedTopics) {
      // Use all eligible topics
      topics = course.topics.filter(t => eligibleTopicIds.includes(t.id));
    } else {
      // Filter selected topics to only include eligible ones
      topics = course.topics.filter(t => selectedTopics.includes(t.id) && eligibleTopicIds.includes(t.id));

      // Check if user tried to select ineligible topics
      const ineligibleSelected = selectedTopics.filter(id => !eligibleTopicIds.includes(id));
      if (ineligibleSelected.length > 0 && topics.length === 0) {
        return res.status(403).json({
          error: `The selected topics are not available. You need to practice at least ${minQuestionsPerTopic} questions in each topic first.`,
          eligible: false
        });
      }

      if (topics.length === 0) {
        return res.status(400).json({ error: 'No valid topics selected' });
      }
    }

    // Get persona and role if provided
    let persona = null;
    let role = null;

    if (personaId) {
      persona = await storage.getPersona(personaId);
    }

    if (roleId) {
      role = await storage.getRole(roleId, courseId);
    }

    // Create interview session with persona and role
    const session = storage.createInterviewSession(
      courseId,
      course.name,
      selectedTopics,
      topics,
      persona,
      role
    );

    // Get difficulty context for initial prompt
    const difficultyContext = storage.getDifficultyContext(session.id);

    // Generate initial interview question using AI (pass userId for user API keys)
    const response = await groq.startInterview(course, topics, persona, role, difficultyContext, req.user.id);

    // Store the interviewer's message
    storage.addMessageToSession(session.id, 'interviewer', response.message, {
      currentTopic: response.currentTopic
    });

    // Increment question count for the first question
    storage.incrementQuestionCount(session.id);

    res.json({
      sessionId: session.id,
      message: response.message,
      currentTopic: response.currentTopic,
      persona: session.persona,
      targetRole: session.targetRole,
      difficultyLevel: difficultyContext.currentLevel
    });

  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

// Continue interview with user response
router.post('/respond', async (req, res) => {
  try {
    const { sessionId, message, skipped } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }

    // Get active session
    const session = storage.getActiveSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found or expired' });
    }

    // Track if user skipped
    if (skipped) {
      // Get the current topic from the last interviewer message
      const lastInterviewerMsg = [...session.messages].reverse().find(m => m.role === 'interviewer');
      const currentTopicId = lastInterviewerMsg?.metadata?.currentTopic?.id || null;

      storage.incrementSkippedCount(sessionId, currentTopicId);

      // Check if max skips reached (per topic or total)
      const topicSkipInfo = storage.getMaxTopicSkips(sessionId);
      const metrics = storage.getSessionMetrics(sessionId);

      // Check per-topic skip limit first
      if (topicSkipInfo.maxSkips >= MAX_SKIPS_BEFORE_END) {
        const topicName = lastInterviewerMsg?.metadata?.currentTopic?.name || 'this topic';
        return res.json({
          autoEnd: true,
          reason: 'topic_skip_limit',
          message: `Interview ended: You've skipped ${MAX_SKIPS_BEFORE_END} questions on "${topicName}". The interview has been automatically ended.`,
          skippedCount: metrics.skippedCount,
          topicId: topicSkipInfo.topicId
        });
      }
    }

    // Add user message to session
    storage.addMessageToSession(sessionId, 'user', message, { skipped: !!skipped });

    // Get course for context
    const course = await storage.getCourse(session.courseId);

    // Get difficulty context
    const difficultyContext = storage.getDifficultyContext(sessionId);

    // Generate AI response with persona and role context (pass userId for user API keys)
    const response = await groq.continueInterview(
      course,
      session.topics,
      session.messages,
      message,
      session.persona,
      session.targetRole,
      difficultyContext,
      req.user.id
    );

    // Update difficulty tracking based on assessment (not for skipped)
    if (response.assessmentOfLastAnswer && !skipped) {
      storage.updateDifficultyAssessment(sessionId, response.assessmentOfLastAnswer);
    }

    // Get updated difficulty after assessment
    const updatedDifficulty = storage.getDifficultyContext(sessionId);

    // Increment question count if this is a new question (not probing)
    if (!response.isProbing) {
      storage.incrementQuestionCount(sessionId);
    }

    // Add interviewer response to session
    storage.addMessageToSession(sessionId, 'interviewer', response.message, {
      currentTopic: response.currentTopic,
      assessmentOfLastAnswer: response.assessmentOfLastAnswer,
      isProbing: response.isProbing
    });

    // Get current metrics
    const metrics = storage.getSessionMetrics(sessionId);

    res.json({
      message: response.message,
      currentTopic: response.currentTopic,
      assessment: response.assessmentOfLastAnswer,
      difficultyLevel: updatedDifficulty.currentLevel,
      difficultyName: updatedDifficulty.levelName,
      metrics: metrics
    });

  } catch (error) {
    console.error('Error continuing interview:', error);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

// End interview and get summary
router.post('/end', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Get active session
    const session = storage.getActiveSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found or expired' });
    }

    // Get course for context
    const course = await storage.getCourse(session.courseId);

    // Get final metrics before ending
    const metrics = storage.getSessionMetrics(sessionId);

    // Generate summary using AI with persona, role, and difficulty context (pass userId for user API keys)
    const summary = await groq.endInterview(
      course,
      session.topics,
      session.messages,
      session.persona,
      session.targetRole,
      session.difficultyTracker,
      req.user.id
    );

    // Add persona and role info to summary
    summary.persona = session.persona;
    summary.targetRole = session.targetRole;
    summary.difficultyTracker = session.difficultyTracker;
    summary.metrics = {
      questionCount: metrics.questionCount,
      skippedCount: metrics.skippedCount,
      duration: metrics.duration
    };

    // End session and save to storage
    await storage.endInterviewSession(sessionId, summary);

    res.json(summary);

  } catch (error) {
    console.error('Error ending interview:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Get past interview sessions for a course
router.get('/sessions', async (req, res) => {
  try {
    const { courseId } = req.query;

    let sessions;
    if (courseId) {
      sessions = await storage.getInterviewsByCourse(courseId);
    } else {
      const interviews = await storage.getInterviews();
      sessions = interviews.sessions;
    }

    res.json(sessions);

  } catch (error) {
    console.error('Error getting interview sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get specific interview session
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await storage.getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);

  } catch (error) {
    console.error('Error getting interview session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Delete all interview sessions for a course
router.delete('/sessions/course/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    await storage.clearInterviewsByCourse(courseId);
    res.json({ success: true, message: 'Interview history cleared' });
  } catch (error) {
    console.error('Error clearing interview history:', error);
    res.status(500).json({ error: 'Failed to clear interview history' });
  }
});

module.exports = router;
