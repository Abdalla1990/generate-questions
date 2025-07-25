// questions-merger.js - Merges questions from multiple categories for a user
const path = require('path');
const fs = require('fs');

// Import the queue manager for Redis operations
const QueueManager = require('../generate-questions-sets/redis-queue/queue-manager');

// Import shared DynamoDB configuration
const {
  dynamoDb,
  TABLES
} = require('../shared/dynamodb-config');

class QuestionsMerger {
  constructor() {
    this.queueManager = new QueueManager();
    this.isInitialized = false;
  }

  /**
   * Initialize the merger
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    const connected = await this.queueManager.connect();
    if (!connected) {
      throw new Error('Failed to connect to Redis for question merging');
    }

    this.isInitialized = true;
    console.log('✅ Questions merger initialized');
    return true;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.queueManager) {
      await this.queueManager.disconnect();
    }
  }

  /**
   * Get or allocate a new set for a user and category
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @returns {Promise<string|null>} - The set ID or null if none available
   */
  async getOrAllocateSetForUser(userId, categoryId) {
    try {
      // Check if user already has allocated sets for this category
      const userAllocations = await this.queueManager.getUserCategoryAllocations(userId, categoryId);

      if (userAllocations.length > 0) {
        // Return the most recently allocated set
        const lastAllocatedSet = userAllocations[userAllocations.length - 1];
        console.log(`📦 Using existing allocated set ${lastAllocatedSet} for user ${userId}, category ${categoryId}`);
        return lastAllocatedSet;
      }

      // No existing allocation, get a new set
      const newSetId = await this.queueManager.getNextAvailableSetForUser(userId, categoryId);

      if (newSetId) {
        console.log(`🎯 Allocated new set ${newSetId} for user ${userId}, category ${categoryId}`);
        return newSetId;
      } else {
        console.log(`⚠️  No sets available for user ${userId}, category ${categoryId}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error getting/allocating set for user ${userId}, category ${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch question IDs from a set in DynamoDB
   * @param {string} setId - The set ID
   * @returns {Promise<Array>} - Array of question keys {id, hash}
   */
  async getQuestionIdsFromSet(setId) {
    try {
      const params = {
        TableName: TABLES.QUESTION_SETS,
        Key: { id: setId }
      };

      const result = await dynamoDb.get(params).promise();

      if (!result.Item) {
        console.log(`⚠️  Set ${setId} not found in DynamoDB`);
        return [];
      }

      // Use new question_keys field if available, fallback to old question_ids for backwards compatibility
      const questionKeys = result.Item.question_keys ||
        (result.Item.question_ids || []).map(id => ({ id, hash: null }));

      console.log(`📄 Retrieved ${questionKeys.length} question keys from set ${setId}`);
      return questionKeys;
    } catch (error) {
      console.error(`❌ Error fetching question IDs from set ${setId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch actual questions from DynamoDB by keys
   * @param {Array} questionKeys - Array of question keys {id, hash}
   * @returns {Promise<Array>} - Array of question objects
   */
  async getQuestionsByIds(questionKeys) {
    if (questionKeys.length === 0) {
      return [];
    }

    try {
      // Batch get questions (DynamoDB supports up to 100 items per batch)
      const batchSize = 100;
      const questions = [];

      for (let i = 0; i < questionKeys.length; i += batchSize) {
        const batch = questionKeys.slice(i, i + batchSize);

        const requestItems = {
          [TABLES.QUESTIONS]: {
            Keys: batch.map(key => {
              // Handle both new format {id, hash} and old format (just id)
              if (key.hash !== null && key.hash !== undefined) {
                return { id: key.id, hash: key.hash };
              } else {
                // Fallback: scan for questions with this ID (backwards compatibility)
                return null;
              }
            }).filter(key => key !== null)
          }
        };

        // If we have valid keys, use batch get
        if (requestItems[TABLES.QUESTIONS].Keys.length > 0) {
          const params = {
            RequestItems: requestItems
          };

          const result = await dynamoDb.batchGet(params).promise();
          const batchQuestions = result.Responses[TABLES.QUESTIONS] || [];
          questions.push(...batchQuestions);

          console.log(`📚 Retrieved ${batchQuestions.length} questions from batch ${Math.floor(i / batchSize) + 1}`);
        }

        // Handle any keys that don't have hash (backwards compatibility)
        const keysWithoutHash = batch.filter(key => key.hash === null || key.hash === undefined);
        for (const key of keysWithoutHash) {
          try {
            const params = {
              TableName: TABLES.QUESTIONS,
              FilterExpression: 'id = :id',
              ExpressionAttributeValues: {
                ':id': key.id
              },
              Limit: 1
            };

            const result = await dynamoDb.scan(params).promise();

            if (result.Items && result.Items.length > 0) {
              questions.push(result.Items[0]);
            } else {
              console.log(`⚠️  Question with ID ${key.id} not found`);
            }
          } catch (error) {
            console.error(`❌ Error fetching question ${key.id}:`, error.message);
          }
        }
      }

      console.log(`✅ Total questions retrieved: ${questions.length} out of ${questionKeys.length} requested`);
      return questions;
    } catch (error) {
      console.error(`❌ Error fetching questions by IDs:`, error);
      throw error;
    }
  }

  /**
   * Main method: Merge questions from multiple categories for a user
   * @param {string} userId - The user ID
   * @param {Array<string>} categoryIds - Array of category IDs
   * @returns {Promise<Object>} - Merged questions result
   */
  async mergeQuestionsForUser(userId, categoryIds) {
    if (!this.isInitialized) {
      throw new Error('Merger not initialized. Call initialize() first.');
    }

    const result = {
      userId,
      categories: categoryIds,
      sets: {},
      questions: [],
      summary: {
        totalCategories: categoryIds.length,
        successfulCategories: 0,
        totalQuestions: 0,
        categoriesWithNoSets: [],
        categoriesWithErrors: []
      }
    };

    console.log(`🔄 Starting question merge for user ${userId} across ${categoryIds.length} categories`);

    // Process each category
    for (const categoryId of categoryIds) {
      try {
        console.log(`\n📂 Processing category: ${categoryId}`);

        // Get or allocate a set for this category
        const setId = await this.getOrAllocateSetForUser(userId, categoryId);

        if (!setId) {
          result.summary.categoriesWithNoSets.push(categoryId);
          console.log(`⚠️  No sets available for category ${categoryId}`);
          continue;
        }

        // Store set info
        result.sets[categoryId] = setId;

        // Get question IDs from the set
        const questionKeys = await this.getQuestionIdsFromSet(setId);

        if (questionKeys.length === 0) {
          result.summary.categoriesWithNoSets.push(categoryId);
          console.log(`⚠️  Set ${setId} contains no questions for category ${categoryId}`);
          continue;
        }

        // Get actual questions
        const questions = await this.getQuestionsByIds(questionKeys);

        // Add category info to each question for identification
        const categorizedQuestions = questions.map(question => ({
          ...question,
          sourceCategory: categoryId,
          sourceSet: setId
        }));

        result.questions.push(...categorizedQuestions);
        result.summary.successfulCategories++;
        result.summary.totalQuestions += categorizedQuestions.length;

        console.log(`✅ Successfully processed category ${categoryId}: ${categorizedQuestions.length} questions`);

      } catch (error) {
        console.error(`❌ Error processing category ${categoryId}:`, error);
        result.summary.categoriesWithErrors.push({
          categoryId,
          error: error.message
        });
      }
    }

    console.log(`\n🎉 Question merge completed for user ${userId}`);
    console.log(`📊 Summary: ${result.summary.totalQuestions} questions from ${result.summary.successfulCategories}/${result.summary.totalCategories} categories`);

    return result;
  }

  /**
   * Get user's allocation summary
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - User allocation summary
   */
  async getUserAllocationSummary(userId) {
    if (!this.isInitialized) {
      throw new Error('Merger not initialized. Call initialize() first.');
    }

    try {
      const stats = await this.queueManager.getUserAllocationStats(userId);
      return {
        userId,
        totalAllocations: stats.totalAllocations,
        categoriesCount: stats.categoriesCount,
        categories: stats.categories,
        lastUpdated: stats.lastUpdated
      };
    } catch (error) {
      console.error(`❌ Error getting allocation summary for user ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = QuestionsMerger;
