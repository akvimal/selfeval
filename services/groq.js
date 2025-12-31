const {
  getQuestionPrompt,
  getEvaluationPrompt,
  getSuggestionsPrompt,
  getInterviewStartPrompt,
  getInterviewContinuePrompt,
  getInterviewSummaryPrompt
} = require('../prompts/templates');
const { getSetting, getUserApiKeys, trackApiUsage } = require('./database');

// API endpoints
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Available models configuration
const AVAILABLE_MODELS = {
  // Groq models
  'groq:llama-3.3-70b-versatile': { provider: 'groq', model: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)' },
  'groq:llama-3.1-8b-instant': { provider: 'groq', model: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Groq)' },
  'groq:mixtral-8x7b-32768': { provider: 'groq', model: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)' },
  // Anthropic models
  'anthropic:claude-3-5-haiku-latest': { provider: 'anthropic', model: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
  'anthropic:claude-3-5-sonnet-latest': { provider: 'anthropic', model: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
  'anthropic:claude-3-opus-latest': { provider: 'anthropic', model: 'claude-3-opus-latest', name: 'Claude 3 Opus' },
};

const DEFAULT_MODEL = 'groq:llama-3.3-70b-versatile';

// Get model configuration - system default
async function getSystemModelConfig() {
  try {
    const modelKey = await getSetting('ai_model') || DEFAULT_MODEL;
    return { modelKey, config: AVAILABLE_MODELS[modelKey] || AVAILABLE_MODELS[DEFAULT_MODEL] };
  } catch (error) {
    return { modelKey: DEFAULT_MODEL, config: AVAILABLE_MODELS[DEFAULT_MODEL] };
  }
}

// Get API configuration for a specific user
async function getUserApiConfig(userId) {
  if (!userId) return null;

  try {
    const userKeys = await getUserApiKeys(userId);
    if (!userKeys) return null;

    return {
      groq_api_key: userKeys.groq_api_key,
      anthropic_api_key: userKeys.anthropic_api_key,
      preferred_model: userKeys.preferred_model,
      groq_configured: userKeys.groq_configured,
      anthropic_configured: userKeys.anthropic_configured
    };
  } catch (error) {
    console.error('Error getting user API config:', error);
    return null;
  }
}

// Determine which API key and model to use
async function resolveApiConfig(userId = null) {
  const requireUserKeys = await getSetting('require_user_api_keys') === 'true';
  const systemConfig = await getSystemModelConfig();
  const userConfig = userId ? await getUserApiConfig(userId) : null;

  let modelKey = systemConfig.modelKey;
  let modelConfig = systemConfig.config;
  let apiKey = null;
  let usingUserKey = false;

  // If user has a preferred model and the corresponding key, use it
  if (userConfig?.preferred_model && AVAILABLE_MODELS[userConfig.preferred_model]) {
    const preferredConfig = AVAILABLE_MODELS[userConfig.preferred_model];
    const hasKey = preferredConfig.provider === 'groq'
      ? userConfig.groq_api_key
      : userConfig.anthropic_api_key;

    if (hasKey) {
      modelKey = userConfig.preferred_model;
      modelConfig = preferredConfig;
      apiKey = hasKey;
      usingUserKey = true;
    }
  }

  // If no user key yet, try to find any available user key
  if (!apiKey && userConfig) {
    if (modelConfig.provider === 'groq' && userConfig.groq_api_key) {
      apiKey = userConfig.groq_api_key;
      usingUserKey = true;
    } else if (modelConfig.provider === 'anthropic' && userConfig.anthropic_api_key) {
      apiKey = userConfig.anthropic_api_key;
      usingUserKey = true;
    } else if (userConfig.groq_api_key) {
      // Switch to groq if user has groq key but model is anthropic
      const groqModelKey = 'groq:llama-3.3-70b-versatile';
      modelKey = groqModelKey;
      modelConfig = AVAILABLE_MODELS[groqModelKey];
      apiKey = userConfig.groq_api_key;
      usingUserKey = true;
    } else if (userConfig.anthropic_api_key) {
      // Switch to anthropic if user has anthropic key but model is groq
      const anthropicModelKey = 'anthropic:claude-3-5-haiku-latest';
      modelKey = anthropicModelKey;
      modelConfig = AVAILABLE_MODELS[anthropicModelKey];
      apiKey = userConfig.anthropic_api_key;
      usingUserKey = true;
    }
  }

  // Fall back to system keys if user keys not required or not available
  if (!apiKey) {
    if (requireUserKeys) {
      throw new Error('You must configure your own API keys in your profile settings to use AI features.');
    }

    // Use system API key
    if (modelConfig.provider === 'groq') {
      apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('No API key available. Please configure your Groq API key in your profile settings.');
      }
    } else {
      apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('No API key available. Please configure your Anthropic API key in your profile settings.');
      }
    }
  }

  return { modelKey, modelConfig, apiKey, usingUserKey, userId };
}

async function callGroqAPI(prompt, modelConfig, apiKey) {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'You are an educational assistant that generates quiz questions and evaluates answers. Always respond with valid JSON only, no markdown formatting or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    tokens: data.usage?.total_tokens || 0
  };
}

async function callAnthropicAPI(prompt, modelConfig, apiKey) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: 1024,
      system: 'You are an educational assistant that generates quiz questions and evaluates answers. Always respond with valid JSON only, no markdown formatting or additional text.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
  };
}

async function callAI(prompt, userId = null) {
  const config = await resolveApiConfig(userId);

  let result;
  if (config.modelConfig.provider === 'anthropic') {
    result = await callAnthropicAPI(prompt, config.modelConfig, config.apiKey);
  } else {
    result = await callGroqAPI(prompt, config.modelConfig, config.apiKey);
  }

  // Track usage if using user's own API key
  if (config.usingUserKey && config.userId) {
    try {
      await trackApiUsage(config.userId, config.modelConfig.provider, config.modelKey, result.tokens);
    } catch (e) {
      console.error('Failed to track API usage:', e);
    }
  }

  // Parse JSON from response, handling potential markdown code blocks
  let jsonStr = result.content;
  if (result.content.includes('```')) {
    const match = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      jsonStr = match[1];
    }
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error('Failed to parse AI response:', result.content);
    throw new Error('Failed to parse AI response as JSON');
  }
}

// Legacy function name for compatibility
async function callGroq(prompt, userId = null) {
  return callAI(prompt, userId);
}

async function generateQuestion(topic, questionType, specificSubtopic = null, userId = null) {
  const prompt = getQuestionPrompt(topic, topic.subtopics, questionType, specificSubtopic);
  const question = await callGroq(prompt, userId);

  return {
    ...question,
    type: questionType,
    topicId: topic.id,
    topicName: topic.name,
    subtopic: specificSubtopic || null
  };
}

async function evaluateAnswer(questionType, question, userAnswer, questionData, userId = null) {
  const prompt = getEvaluationPrompt(questionType, question, userAnswer, questionData);

  if (!prompt) {
    // For MCQ, True/False, Fill in the blank - use direct comparison
    return evaluateDirectAnswer(questionType, userAnswer, questionData);
  }

  // For concept and comparison - use AI evaluation
  return await callGroq(prompt, userId);
}

function evaluateDirectAnswer(questionType, userAnswer, questionData) {
  let isCorrect = false;
  let score = 0;
  let feedback = '';

  switch (questionType) {
    case 'mcq':
      const selectedIndex = parseInt(userAnswer, 10);
      isCorrect = selectedIndex === questionData.correctAnswer;
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? 'Correct! ' + questionData.explanation
        : `Incorrect. The correct answer was: "${questionData.options[questionData.correctAnswer]}". ${questionData.explanation}`;
      break;

    case 'truefalse':
      const userBool = userAnswer === 'true' || userAnswer === true;
      isCorrect = userBool === questionData.correctAnswer;
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? 'Correct! ' + questionData.explanation
        : `Incorrect. The statement is ${questionData.correctAnswer ? 'TRUE' : 'FALSE'}. ${questionData.explanation}`;
      break;

    case 'fillblank':
      const userAnswerLower = userAnswer.toLowerCase().trim();
      const acceptableAnswers = questionData.acceptableAnswers.map(a => a.toLowerCase().trim());
      isCorrect = acceptableAnswers.includes(userAnswerLower);
      score = isCorrect ? 100 : 0;
      feedback = isCorrect
        ? 'Correct! ' + questionData.explanation
        : `Incorrect. The correct answer was: "${questionData.correctAnswer}". ${questionData.explanation}`;
      break;
  }

  return { isCorrect, score, feedback };
}

async function getSuggestions(performance, userId = null) {
  if (!performance.overall || performance.overall.totalQuestions === 0) {
    return {
      motivation: "Welcome to your learning journey! Start practicing with any topic to begin tracking your progress.",
      strengths: [],
      areasToImprove: [],
      suggestions: [
        "Pick a topic you're curious about and try a few questions",
        "Don't worry about getting everything right - learning from mistakes is valuable",
        "Try different question types to find what works best for you"
      ],
      nextSteps: "Begin with a topic you're most interested in!"
    };
  }

  const prompt = getSuggestionsPrompt(performance);
  return await callGroq(prompt, userId);
}

// ============================================================
// INTERVIEW FUNCTIONS
// ============================================================

async function startInterview(course, topics, persona = null, role = null, difficultyContext = null, userId = null) {
  const prompt = getInterviewStartPrompt(course, topics, persona, role, difficultyContext);
  return await callGroq(prompt, userId);
}

async function continueInterview(course, topics, conversationHistory, userResponse, persona = null, role = null, difficultyContext = null, userId = null) {
  const prompt = getInterviewContinuePrompt(course, topics, conversationHistory, userResponse, persona, role, difficultyContext);
  return await callGroq(prompt, userId);
}

async function endInterview(course, topics, conversationHistory, persona = null, role = null, difficultyTracker = null, userId = null) {
  const prompt = getInterviewSummaryPrompt(course, topics, conversationHistory, persona, role, difficultyTracker);
  return await callGroq(prompt, userId);
}

module.exports = {
  callGroq,
  callAI,
  generateQuestion,
  evaluateAnswer,
  getSuggestions,
  startInterview,
  continueInterview,
  endInterview,
  AVAILABLE_MODELS,
  DEFAULT_MODEL
};
