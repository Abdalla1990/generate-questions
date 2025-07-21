// storage.js - Question hashing and DynamoDB storage
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  ensureTableExists,
  getItemsByHash,
  batchPutItems
} = require('./database/store-items');

/**
 * Generate SHA256 hash for question title
 * @param {Object} question - The question object
 * @returns {string} - SHA256 hash of the question title
 */
function generateQuestionHash(question) {
  const title = question.title || '';

  // Generate SHA256 hash
  return crypto.createHash('sha256').update(title, 'utf8').digest('hex');
}

/**
 * Prepare question for storage by adding hash and ID
 * @param {Object} question - The original question object
 * @returns {Object} - Question object ready for storage
 */
function prepareQuestionForStorage(question) {
  // Generate hash for the question content
  const hash = generateQuestionHash(question);

  // Generate unique ID if not present
  const id = question.id || uuidv4();

  // Add metadata
  const timestamp = new Date().toISOString();

  return {
    ...question,
    id,
    hash,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: '1.0'
  };
}

/**
 * Check if a question already exists based on its hash
 * @param {string} hash - The question hash
 * @returns {Promise<Array>} - Array of existing questions with the same hash
 */
async function checkQuestionExists(hash) {
  try {
    const existingQuestions = await getItemsByHash(hash);
    return existingQuestions;
  } catch (error) {
    console.error('❌ Error checking if question exists:', error);
    throw error;
  }
}

/**
 * Store multiple questions in DynamoDB
 * @param {Array} questions - Array of questions to store
 * @param {Object} options - Storage options
 * @returns {Promise<Object>} - Batch storage result
 */
async function storeQuestions(questions, options = {}) {
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    throw new Error('Invalid questions array provided');
  }

  console.log(`📦 Preparing to store ${questions.length} questions...`);

  try {
    // Ensure DynamoDB table exists
    await ensureTableExists();

    // Prepare all questions for storage
    const preparedQuestions = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const preparedQuestion = prepareQuestionForStorage(question);
      preparedQuestions.push(preparedQuestion);
    }

    // Check all questions for duplicates first
    console.log('🔍 Checking all questions for duplicates...');
    const uniqueQuestions = [];
    let skippedCount = 0;

    for (let i = 0; i < preparedQuestions.length; i++) {
      const existingQuestions = await checkQuestionExists(preparedQuestions[i].hash);
      if (existingQuestions.length > 0) {
        console.log(`⚠️  Skipping duplicate question at index ${i} with hash '${preparedQuestions[i].hash.substring(0, 8)}...'`);
        skippedCount++;
      } else {
        uniqueQuestions.push(preparedQuestions[i]);
      }
    }

    console.log(`✅ Found ${uniqueQuestions.length} unique questions (${skippedCount} duplicates skipped). Proceeding with bulk storage...`);

    // Store all unique questions in bulk
    const batchResult = await batchPutItems(uniqueQuestions);

    const results = {
      total: questions.length,
      stored: batchResult.processedItems,
      skipped: skippedCount,
      failed: questions.length - batchResult.processedItems - skippedCount
    };

    console.log(`✅ Bulk storage complete: ${results.stored} questions stored`);

    return results;

  } catch (error) {
    console.error('❌ Error in bulk storage operation:', error);
    throw error;
  }
}

/**
 * Generate storage statistics for questions
 * @param {Array} questions - Array of questions
 * @returns {Object} - Statistics object
 */
function generateStorageStats(questions) {
  if (!questions || !Array.isArray(questions)) {
    return { error: 'Invalid questions array' };
  }

  const stats = {
    total: questions.length,
    byType: {},
    byCategory: {},
    hashDistribution: {},
    duplicateHashes: []
  };

  const hashCounts = {};

  questions.forEach((question, index) => {
    // Count by type
    const type = question.type || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    // Count by category
    const category = question.category || 'unknown';
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    // Track hash distribution
    const hash = generateQuestionHash(question);
    hashCounts[hash] = (hashCounts[hash] || 0) + 1;

    if (hashCounts[hash] > 1) {
      stats.duplicateHashes.push({
        hash,
        count: hashCounts[hash],
        questionIndex: index
      });
    }
  });

  stats.hashDistribution = {
    unique: Object.keys(hashCounts).length,
    total: questions.length,
    duplicates: stats.duplicateHashes.length
  };

  return stats;
}

module.exports = {
  generateStorageStats,
  generateQuestionHash,
  storeQuestions
};
