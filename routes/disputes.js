const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createDispute,
  getDisputeByHistoryId,
  getUserDisputes,
  getHistoryById
} = require('../services/database');

// All routes require authentication
router.use(requireAuth);

// POST /api/disputes - Create a new dispute
router.post('/', async (req, res) => {
  try {
    const { historyId, disputeReason } = req.body;
    const userId = req.user.id;

    if (!historyId || !disputeReason) {
      return res.status(400).json({ error: 'History ID and dispute reason are required' });
    }

    if (disputeReason.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide a more detailed explanation (at least 10 characters)' });
    }

    // Get the history record
    const history = await getHistoryById(historyId);
    if (!history) {
      return res.status(404).json({ error: 'Question history not found' });
    }

    // Verify the history belongs to the user
    if (history.user_id !== userId) {
      return res.status(403).json({ error: 'You can only dispute your own answers' });
    }

    // Check if dispute already exists for this history
    const existingDispute = await getDisputeByHistoryId(historyId);
    if (existingDispute) {
      return res.status(409).json({ error: 'A dispute already exists for this question', dispute: existingDispute });
    }

    // Only allow disputes for concept, comparison, and fillblank questions
    const allowedTypes = ['concept', 'comparison', 'fillblank'];
    if (!allowedTypes.includes(history.question_type)) {
      return res.status(400).json({ error: 'Disputes are only allowed for Concept, Comparison, and Fill-in-the-Blank questions' });
    }

    // Create the dispute
    const originalScore = history.result.score || 0;
    const dispute = await createDispute(
      userId,
      historyId,
      history.course_id,
      history.topic_id,
      disputeReason.trim(),
      originalScore
    );

    res.status(201).json({
      message: 'Dispute submitted successfully. It will be reviewed by an admin.',
      dispute: {
        id: dispute.id,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Error creating dispute:', error);
    res.status(500).json({ error: 'Failed to submit dispute' });
  }
});

// GET /api/disputes - Get user's disputes
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const status = req.query.status || null;

    const disputes = await getUserDisputes(userId, status);

    res.json({ disputes });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

// GET /api/disputes/check/:historyId - Check if a dispute exists for a history record
router.get('/check/:historyId', async (req, res) => {
  try {
    const historyId = parseInt(req.params.historyId);

    const dispute = await getDisputeByHistoryId(historyId);

    res.json({
      hasDispute: !!dispute,
      dispute: dispute || null
    });
  } catch (error) {
    console.error('Error checking dispute:', error);
    res.status(500).json({ error: 'Failed to check dispute status' });
  }
});

module.exports = router;
