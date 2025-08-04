// api/src/server.js - Express API server for questions functionality
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables from root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.join(__dirname, '../../');

// Load the appropriate .env file based on NODE_ENV
const envFile = process.env.NODE_ENV === 'development' ? '.env.dev' : '.env';
const envPath = path.join(rootDir, envFile);

console.log(`🔧 Loading environment from: ${envPath}`);
dotenv.config({ path: envPath });

// Import our wrapped CommonJS modules
import { generateQuestionSets } from '../wrappers/generate-questions-sets-wrapper.js';
import { generateGPTQuestions } from '../wrappers/generate-questions-wrapper.js';
import SetsAllocator from '../wrappers/sets-allocator-wrapper.js';
import QuestionsMerger from '../wrappers/questions-merger-wrapper.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*'
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting with environment configuration
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
});

// Different rate limits for different endpoints
const generalLimit = createRateLimit(
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  'Too many requests'
);
const heavyLimit = createRateLimit(
  parseInt(process.env.HEAVY_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
  parseInt(process.env.HEAVY_RATE_LIMIT_MAX_REQUESTS) || 10,
  'Too many heavy operations'
);

// Apply general rate limiting to all routes
app.use('/api/', generalLimit);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'questions-api'
  });
});

// Utility function for async error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 1. Generate Questions Endpoint
app.post('/api/questions/generate', heavyLimit, asyncHandler(async (req, res) => {
  try {
    console.log(`🚀 API: Question generation request received`);

    // Return immediate response
    res.json({
      success: true,
      message: `Question generation request fired and is being processed in the background`,
      timestamp: new Date().toISOString()
    });

    // Run the operation in the background (fire and forget)
    generateGPTQuestions()
      .then(result => {
        console.log(`✅ Background: Questions generated successfully`, result);
      })
      .catch(error => {
        console.error('❌ Background: Error generating questions:', error);
      });

  } catch (error) {
    console.error('❌ API Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process question generation request',
      timestamp: new Date().toISOString()
    });
  }
}));

// 2. Generate Sets Endpoint
app.post('/api/sets/generate', heavyLimit, asyncHandler(async (req, res) => {
  const { numSetsPerCategory, questionsPerSet } = req.body;
  console.log(`🚀 API: Sets generation request received for ${numSetsPerCategory} sets per category with ${questionsPerSet} questions each`);
  if (numSetsPerCategory <= 0 || questionsPerSet <= 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'numSetsPerCategory and questionsPerSet must be positive numbers'
    });
  }

  try {
    console.log(`🚀 API: Sets generation request received for ${numSetsPerCategory} sets per category with ${questionsPerSet} questions each`);

    // Return immediate response
    res.json({
      success: true,
      message: `Sets generation request fired and is being processed in the background`,
      data: {
        numSetsPerCategory,
        questionsPerSet
      },
      timestamp: new Date().toISOString()
    });

    // Run the operation in the background (fire and forget)
    generateQuestionSets(numSetsPerCategory, questionsPerSet)
      .then(result => {
        console.log(`✅ Background: Sets generated successfully for ${numSetsPerCategory} sets per category`, result);
      })
      .catch(error => {
        console.error('❌ Background: Error generating sets:', error);
      });

  } catch (error) {
    console.error('❌ API Error processing sets generation request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process sets generation request',
      timestamp: new Date().toISOString()
    });
  }
}));

// 3. Allocate Sets Endpoint
app.post('/api/sets/allocate', asyncHandler(async (req, res) => {
  const { userId, categoryIds } = req.body;

  if (!userId || !categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'userId and categoryIds array are required'
    });
  }

  try {
    console.log(`🚀 API: Sets allocation request received for user ${userId} across ${categoryIds.length} categories`);

    // Return immediate response
    res.json({
      success: true,
      message: `Sets allocation request fired and is being processed in the background`,
      data: {
        userId,
        categoryIds
      },
      timestamp: new Date().toISOString()
    });

    // Run the operation in the background (fire and forget)
    (async () => {
      let allocator;
      try {
        // Initialize the allocator
        allocator = new SetsAllocator();
        await allocator.initialize();

        // Call the existing allocation function
        const result = await allocator.allocateSetsForUser(userId, categoryIds);
        console.log(`✅ Background: Sets allocated successfully for user ${userId}`, result);

      } catch (error) {
        console.error('❌ Background: Error allocating sets:', error);
      } finally {
        // Clean up
        if (allocator) {
          try {
            await allocator.disconnect();
          } catch (cleanupError) {
            console.error('⚠️ Background: Error during allocator cleanup:', cleanupError);
          }
        }
      }
    })();

  } catch (error) {
    console.error('❌ API Error processing sets allocation request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process sets allocation request',
      timestamp: new Date().toISOString()
    });
  }
}));

// 4. Merge Questions Endpoint
app.post('/api/questions/merge', asyncHandler(async (req, res) => {
  const { userId, categoryIds } = req.body;

  if (!userId || !categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'userId and categoryIds array are required'
    });
  }

  let merger;
  try {
    console.log(`🚀 API: Merging questions for user ${userId} across ${categoryIds.length} categories`);

    // Initialize the merger
    merger = new QuestionsMerger();
    await merger.initialize();

    // Get questions for each category
    const results = {};
    const questions = [];

    for (const categoryId of categoryIds) {
      const setId = await merger.getOrAllocateSetForUser(userId, categoryId);

      if (setId) {
        const questionIds = await merger.getQuestionIdsFromSet(setId);
        const categoryQuestions = await merger.getQuestionsByIds(questionIds);

        results[categoryId] = {
          setId,
          questionCount: categoryQuestions.length,
          questions: categoryQuestions
        };

        questions.push(...categoryQuestions);
      } else {
        results[categoryId] = {
          setId: null,
          questionCount: 0,
          questions: [],
          message: 'No sets available for this category'
        };
      }
    }

    res.json({
      success: true,
      message: `Merged questions for user ${userId}`,
      data: {
        userId,
        categoryIds,
        totalQuestions: questions.length,
        categoryResults: results,
        allQuestions: questions
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ API Error merging questions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to merge questions',
      timestamp: new Date().toISOString()
    });
  } finally {
    // Clean up
    if (merger) {
      try {
        await merger.disconnect();
      } catch (cleanupError) {
        console.error('⚠️ Error during merger cleanup:', cleanupError);
      }
    }
  }
}));

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Unhandled API Error:', error);

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Questions API server running on port ${PORT}`);
  console.log(`📚 Available endpoints:`);
  console.log(`   POST /api/questions/generate - Generate new questions`);
  console.log(`   POST /api/sets/generate - Generate question sets`);
  console.log(`   POST /api/sets/allocate - Allocate sets to users`);
  console.log(`   POST /api/questions/merge - Merge questions for users`);
  console.log(`   GET  /health - Health check`);
});

export default app;
