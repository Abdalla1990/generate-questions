// generate-questions-sets.js - Generate question sets for each category
const { v4: uuidv4 } = require('uuid');
const SetTracker = require('./redis-queue/set-tracker');
const {
  dynamoDb,
  dynamoDbAdmin,
  TABLES,
  ensureQuestionSetsTableExists
} = require('../shared/dynamodb-config');

// Load supported categories from categories.json
const fs = require('fs');
const path = require('path');

/**
 * Load supported categories from categories.json
 * @returns {Array} - Array of category objects
 */
function loadCategories() {
  const categoriesPath = path.join(__dirname, '../', 'categories.json');
  const categoriesData = fs.readFileSync(categoriesPath, 'utf8');
  return JSON.parse(categoriesData);
}

/**
 * Create the question_sets table if it doesn't exist
 * @returns {Promise<boolean>} - Returns true if table exists or was created successfully
 */
async function ensureSetsTableExists() {
  return ensureQuestionSetsTableExists();
}

/**
 * Get the last read question ID (offset) for a category from the sets table
 * @param {string} categoryId - The category ID
 * @returns {Promise<string|null>} - The last read question ID or null if none found
 */
async function getLastReadQuestionId(categoryId) {
  const params = {
    TableName: TABLES.QUESTION_SETS,
    IndexName: 'category-index',
    KeyConditionExpression: 'category_id = :category_id',
    ExpressionAttributeValues: {
      ':category_id': categoryId
    },
    ScanIndexForward: false, // Sort descending by created_at
    Limit: 1
  };

  try {
    const result = await dynamoDb.query(params).promise();
    const items = result.Items || [];

    if (items.length > 0) {
      return items[0].offset || null;
    }

    return null;
  } catch (error) {
    console.error(`❌ Error getting last read question ID for category ${categoryId}:`, error);
    return null;
  }
}

/**
 * Query questions by category from DynamoDB starting after a specific question ID
 * @param {string} categoryId - The category ID to query
 * @param {string|null} lastReadQuestionId - The last read question ID to start after
 * @returns {Promise<Array>} - Array of questions for the category
 */
async function getQuestionsByCategory(categoryId, lastReadQuestionId = null) {
  let params = {
    TableName: TABLES.QUESTIONS,
    FilterExpression: 'categoryId = :category',
    ExpressionAttributeValues: {
      ':category': categoryId
    }
  };

  // If we have a lastReadQuestionId, exclude it from results
  if (lastReadQuestionId) {
    params.FilterExpression += ' AND id <> :lastReadId';
    params.ExpressionAttributeValues[':lastReadId'] = lastReadQuestionId;
  }

  try {
    const result = await dynamoDb.scan(params).promise();
    let questions = result.Items || [];

    // Sort questions by ID to ensure consistent ordering
    questions.sort((a, b) => a.id.localeCompare(b.id));

    // If we have a lastReadQuestionId, filter to only include questions that come after it
    if (lastReadQuestionId) {
      questions = questions.filter(q => q.id > lastReadQuestionId);
    }

    return questions;
  } catch (error) {
    console.error(`❌ Error querying questions for category ${categoryId}:`, error);
    throw error;
  }
}

/**
 * Generate question sets for a category
 * @param {Array} questions - Array of questions for the category
 * @param {number} numSets - Number of sets to generate
 * @param {number} questionsPerSet - Number of questions per set
 * @returns {Array} - Array of question sets
 */
function generateSetsForCategory(questions, numSets, questionsPerSet) {
  const sets = [];

  for (let setIndex = 0; setIndex < numSets; setIndex++) {
    const startIndex = setIndex * questionsPerSet;
    const endIndex = startIndex + questionsPerSet;
    const set = questions.slice(startIndex, endIndex);

    if (set.length === questionsPerSet) {
      sets.push(set);
    }
  }

  return sets;
}

/**
 * Store question sets to question_sets table and add to Redis queue
 * @param {string} categoryId - The category ID
 * @param {Array} sets - Array of question sets
 * @param {Array} allQuestionsUsed - All questions used across all sets for this batch
 * @param {SetTracker} setTracker - Redis set tracker instance
 * @returns {Promise<Array>} - Array of stored set records
 */
async function storeSetsForCategory(categoryId, sets, allQuestionsUsed, setTracker = null) {
  // Find the highest question ID used across all sets to use as the offset
  const lastQuestionUsed = allQuestionsUsed
    .map(q => q.id)
    .sort()
    .pop(); // Get the highest ID (lexicographically last)

  const storedSets = [];

  for (let setIndex = 0; setIndex < sets.length; setIndex++) {
    const setId = uuidv4();
    const questionKeys = sets[setIndex].map(q => ({ id: q.id, hash: q.hash }));

    const setItem = {
      id: setId,
      category_id: categoryId,
      question_keys: questionKeys, // Store both id and hash
      question_ids: sets[setIndex].map(q => q.id), // Keep for backwards compatibility
      created_at: new Date().toISOString(),
      offset: lastQuestionUsed // Use the highest ID from all questions used in this batch
    };

    const params = {
      TableName: TABLES.QUESTION_SETS,
      Item: setItem
    };

    try {
      await dynamoDb.put(params).promise();
      console.log(`✅ Stored set ${setIndex + 1} for category ${categoryId} (ID: ${setId}, offset: ${lastQuestionUsed})`);

      // Add to stored sets array for Redis processing
      storedSets.push({ id: setId, ...setItem });
    } catch (error) {
      console.error(`❌ Error storing set ${setIndex + 1} for category ${categoryId}:`, error);
      throw error;
    }
  }

  // Add sets to Redis queue if tracker is provided
  if (setTracker) {
    try {
      await setTracker.processNewSets(categoryId, storedSets);
    } catch (error) {
      console.error(`⚠️  Failed to add sets to Redis queue for category ${categoryId}:`, error);
      // Don't throw error here to avoid failing the entire process
    }
  }

  return storedSets;
}

/**
 * Main function to generate question sets
 * @param {number} numSetsPerCategory - Number of sets to generate per category
 * @param {number} questionsPerSet - Number of questions per set
 * @param {boolean} useRedisQueue - Whether to use Redis queue for tracking sets
 */
async function generateQuestionSets(numSetsPerCategory, questionsPerSet, useRedisQueue = true) {
  let setTracker = null;

  try {
    console.log(`🚀 Starting generation of ${numSetsPerCategory} sets per category (${questionsPerSet} questions per set)...`);

    // Initialize Redis set tracker if enabled
    if (useRedisQueue) {
      try {
        setTracker = new SetTracker();
        await setTracker.initialize();
        console.log('✅ Redis queue initialized');
      } catch (error) {
        console.warn('⚠️  Redis queue initialization failed, continuing without Redis:', error.message);
        setTracker = null;
      }
    }

    // Ensure tables exist
    await ensureSetsTableExists();

    // Load categories
    const categories = loadCategories();
    console.log(`📂 Loaded ${categories.length} categories`);

    for (const category of categories) {
      console.log(`\n🔍 Processing category: ${category.id} (${category.name})`);

      // Get the last read question ID for this category
      const lastReadQuestionId = await getLastReadQuestionId(category.id);
      console.log(`📍 Last read question ID: ${lastReadQuestionId || 'none (starting from beginning)'}`);

      // Get questions for this category starting after the last read question
      const questions = await getQuestionsByCategory(category.id, lastReadQuestionId);
      console.log(`📦 Found ${questions.length} questions for category ${category.id} after last read question`);

      // Calculate maximum possible sets from available questions
      const requiredQuestions = numSetsPerCategory * questionsPerSet;
      const maxPossibleSets = Math.floor(questions.length / questionsPerSet);
      const setsToGenerate = Math.min(numSetsPerCategory, maxPossibleSets);

      if (questions.length < questionsPerSet) {
        console.log(`⚠️  Not enough questions for even one set in category ${category.id}. Required: ${questionsPerSet}, Available: ${questions.length}`);
        continue;
      }

      if (setsToGenerate < numSetsPerCategory) {
        const shortfall = requiredQuestions - questions.length;
        console.log(`⚠️  Limited questions for category ${category.id}. Generating ${setsToGenerate} sets instead of ${numSetsPerCategory}. Short by ${shortfall} questions.`);
      }

      // Generate sets
      const sets = generateSetsForCategory(questions, setsToGenerate, questionsPerSet);
      console.log(`📋 Generated ${sets.length} sets for category ${category.id}`);

      // Calculate all questions used across all sets
      const allQuestionsUsed = questions.slice(0, setsToGenerate * questionsPerSet);

      // Store sets (offset will be stored with each set) and add to Redis queue
      const storedSets = await storeSetsForCategory(category.id, sets, allQuestionsUsed, setTracker);
      console.log(`✅ Stored ${storedSets.length} sets for category ${category.id}`);
    }

    // Show final Redis queue status if enabled
    if (setTracker) {
      try {
        const queueInfo = await setTracker.getQueueInfo();
        console.log(`\n📊 Redis Queue Summary:`);
        console.log(`Total available sets: ${queueInfo.total_available_sets}`);
        console.log(`Categories with sets: ${queueInfo.categories_with_available_sets}/${queueInfo.total_categories}`);
      } catch (error) {
        console.warn('⚠️  Could not retrieve queue summary:', error.message);
      }
    }

    console.log('\n🎉 Question sets generation completed successfully!');
    return new Promise((resolve) => resolve({ setsGenerated: true, categoriesProcessed: categories.length }));
  } catch (error) {
    console.error('❌ Error generating question sets:', error);
    throw error;
  } finally {
    // Cleanup Redis connection
    if (setTracker) {
      await setTracker.cleanup();
    }
  }
}

/**
 * Main function for CLI execution
 */
async function main() {
  try {
    const numSetsPerCategory = parseInt(process.argv[2]);
    const questionsPerSet = parseInt(process.argv[3]);

    if (!numSetsPerCategory || numSetsPerCategory <= 0 || !questionsPerSet || questionsPerSet <= 0) {
      console.log('Usage: node generate-questions-sets.js <number-of-sets-per-category> <questions-per-set>');
      console.log('Example: node generate-questions-sets.js 5 6');
      process.exit(1);
    }

    await generateQuestionSets(numSetsPerCategory, questionsPerSet);

  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run main function if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = {
  generateQuestionSets,
  loadCategories,
  getQuestionsByCategory,
  generateSetsForCategory,
  storeSetsForCategory,
  ensureSetsTableExists,
  getLastReadQuestionId
};