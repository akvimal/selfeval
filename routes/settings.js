const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getUserApiKeys,
  setUserApiKeys,
  deleteUserApiKey,
  getApiUsage,
  getSetting
} = require('../services/database');

// All routes require authentication
router.use(requireAuth);

// GET /api/settings/api-keys - Get user's API key configuration (masked)
router.get('/api-keys', async (req, res) => {
  try {
    const userId = req.user.id;
    const keys = await getUserApiKeys(userId);
    const requireUserKeys = await getSetting('require_user_api_keys');

    // Return masked info (never return actual keys to frontend)
    res.json({
      groq_configured: keys?.groq_configured || false,
      anthropic_configured: keys?.anthropic_configured || false,
      preferred_model: keys?.preferred_model || null,
      updated_at: keys?.updated_at || null,
      require_user_keys: requireUserKeys === 'true'
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API key configuration' });
  }
});

// PUT /api/settings/api-keys - Update user's API keys
router.put('/api-keys', async (req, res) => {
  try {
    const userId = req.user.id;
    const { groq_api_key, anthropic_api_key, preferred_model } = req.body;

    await setUserApiKeys(userId, groq_api_key || null, anthropic_api_key || null, preferred_model || null);

    res.json({
      message: 'API keys updated successfully',
      groq_configured: !!groq_api_key,
      anthropic_configured: !!anthropic_api_key,
      preferred_model: preferred_model || null
    });
  } catch (error) {
    console.error('Error updating API keys:', error);
    res.status(500).json({ error: 'Failed to update API keys' });
  }
});

// POST /api/settings/api-keys/test - Test API key connectivity (MUST be before :provider route)
router.post('/api-keys/test', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  try {
    const { provider, api_key } = req.body;

    if (!provider || !api_key) {
      return res.status(400).json({ error: 'Provider and API key are required', valid: false });
    }

    if (!['groq', 'anthropic'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider', valid: false });
    }

    let result;
    if (provider === 'groq') {
      result = await testGroqKey(api_key);
    } else {
      result = await testAnthropicKey(api_key);
    }

    res.json(result);
  } catch (error) {
    console.error('Error testing API key:', error);
    res.status(500).json({ error: 'Failed to test API key', valid: false });
  }
});

// DELETE /api/settings/api-keys/:provider - Remove a specific API key
router.delete('/api-keys/:provider', async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider } = req.params;

    if (!['groq', 'anthropic'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    await deleteUserApiKey(userId, provider);
    res.json({ message: `${provider} API key removed successfully` });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// GET /api/settings/api-usage - Get user's API usage stats
router.get('/api-usage', async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const usage = await getApiUsage(userId, days);
    res.json(usage);
  } catch (error) {
    console.error('Error fetching API usage:', error);
    res.status(500).json({ error: 'Failed to fetch API usage' });
  }
});

// GET /api/settings/available-models - Get available AI models (for user profile)
router.get('/available-models', async (req, res) => {
  try {
    const { AVAILABLE_MODELS, DEFAULT_MODEL } = require('../services/groq');
    const systemModel = await getSetting('ai_model') || DEFAULT_MODEL;

    res.json({
      models: Object.entries(AVAILABLE_MODELS).map(([key, config]) => ({
        key,
        ...config
      })),
      systemDefault: systemModel
    });
  } catch (error) {
    console.error('Error fetching available models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Helper function to test Groq API key
async function testGroqKey(apiKey) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        valid: true,
        message: 'API key is valid',
        models: data.data?.length || 0
      };
    } else {
      const error = await response.text();
      return {
        valid: false,
        message: response.status === 401 ? 'Invalid API key' : `Error: ${response.status}`,
        error
      };
    }
  } catch (error) {
    return {
      valid: false,
      message: 'Connection failed',
      error: error.message
    };
  }
}

// Helper function to test Anthropic API key
async function testAnthropicKey(apiKey) {
  try {
    // Use a minimal request to validate the key
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (response.ok) {
      return {
        valid: true,
        message: 'API key is valid'
      };
    } else {
      const error = await response.text();
      const errorData = JSON.parse(error);
      return {
        valid: false,
        message: response.status === 401 ? 'Invalid API key' : (errorData.error?.message || `Error: ${response.status}`),
        error
      };
    }
  } catch (error) {
    return {
      valid: false,
      message: 'Connection failed',
      error: error.message
    };
  }
}

module.exports = router;
