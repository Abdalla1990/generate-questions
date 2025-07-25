// enhanced-storage.js - Storage with semantic deduplication
const SemanticDeduplicator = require('./semantic-deduplicator');
const { dynamoDb, TABLES } = require('../../shared/dynamodb-config');
const { storeQuestions } = require('./storage');

/**
 * Get questions with embeddings by category
 * @param {string} categoryId - Category ID to filter by
 * @returns {Promise<Array>} - Array of questions with embeddings
 */
async function getQuestionsWithEmbeddingsByCategory(categoryId) {
  try {
    const params = {
      TableName: TABLES.QUESTIONS,
      IndexName: 'category-index',
      KeyConditionExpression: 'categoryId = :categoryId',
      ExpressionAttributeValues: {
        ':categoryId': categoryId
      },
      FilterExpression: 'attribute_exists(embedding)' // Only get questions with embeddings
    };

    const result = await dynamoDb.query(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error(`❌ Error fetching questions with embeddings for category ${categoryId}:`, error);
    return [];
  }
}

/**
 * Get questions by category (with pagination support)
 * @param {string} categoryId - Category ID to filter by
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of questions
 */
async function getQuestionsByCategory(categoryId, options = {}) {
  try {
    const params = {
      TableName: TABLES.QUESTIONS,
      IndexName: 'category-index',
      KeyConditionExpression: 'categoryId = :categoryId',
      ExpressionAttributeValues: {
        ':categoryId': categoryId
      }
    };

    if (options.limit) {
      params.Limit = options.limit;
    }

    if (options.exclusiveStartKey) {
      params.ExclusiveStartKey = options.exclusiveStartKey;
    }

    const result = await dynamoDb.query(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error(`❌ Error fetching questions for category ${categoryId}:`, error);
    return [];
  }
}

/**
 * Group array by a specific key
 * @param {Array} array - Array to group
 * @param {string} key - Key to group by
 * @returns {Object} - Grouped object
 */
function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

/**
 * Store questions with semantic deduplication
 * @param {Array} questions - Array of questions to store
 * @param {Object} options - Storage options
 * @returns {Promise<Object>} - Storage result
 */
async function storeQuestionsWithSemanticDeduplication(questions, options = {}) {
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    throw new Error('Invalid questions array provided');
  }

  // Initialize semantic deduplicator
  const deduplicator = new SemanticDeduplicator({
    similarityThreshold: options.similarityThreshold || 0.88,
    embeddingModel: options.embeddingModel || 'text-embedding-3-small'
  });

  console.log(`🧠 Starting semantic deduplication for ${questions.length} questions...`);

  const results = {
    total: questions.length,
    processed: [],
    duplicates: [],
    errors: [],
    semanticDuplicatesSkipped: 0,
    hashDuplicatesSkipped: 0,
    stored: 0,
    failed: 0
  };

  try {
    // Group questions by category for efficient processing
    const questionsByCategory = groupBy(questions, 'categoryId');

    for (const [categoryId, categoryQuestions] of Object.entries(questionsByCategory)) {
      console.log(`\n📂 Processing ${categoryQuestions.length} questions for category: ${categoryId}`);

      // Get existing questions with embeddings in this category
      const existingQuestions = await getQuestionsWithEmbeddingsByCategory(categoryId);
      console.log(`📋 Found ${existingQuestions.length} existing questions with embeddings in category ${categoryId}`);

      // Process questions in this category
      const categoryResults = await deduplicator.batchProcessQuestions(categoryQuestions, existingQuestions);

      // Accumulate results
      results.processed.push(...categoryResults.processed);
      results.duplicates.push(...categoryResults.duplicates);
      results.errors.push(...categoryResults.errors);
    }

    // Store processed (unique) questions
    if (results.processed.length > 0) {
      console.log(`\n💾 Storing ${results.processed.length} unique questions...`);

      try {
        const storageResult = await storeQuestions(results.processed, options);
        results.stored = storageResult.stored || 0;
        results.failed = storageResult.failed || 0;
        results.hashDuplicatesSkipped = storageResult.skipped || 0; // Track hash duplicates from legacy storage

        console.log(`✅ Storage complete: ${results.stored} stored, ${results.failed} failed, ${results.hashDuplicatesSkipped} hash duplicates`);
      } catch (storageError) {
        console.error('❌ Error during storage:', storageError);
        results.failed = results.processed.length;
      }
    } else {
      console.log('ℹ️  No unique questions to store');
    }

    // Update final counts
    results.semanticDuplicatesSkipped = results.duplicates.length;

    // Print summary
    console.log(`\n📊 Semantic Deduplication Summary:`);
    console.log(`   Total questions: ${results.total}`);
    console.log(`   Unique questions: ${results.processed.length}`);
    console.log(`   Semantic duplicates: ${results.semanticDuplicatesSkipped}`);
    console.log(`   Hash duplicates: ${results.hashDuplicatesSkipped}`);
    console.log(`   Processing errors: ${results.errors.length}`);
    console.log(`   Successfully stored: ${results.stored}`);
    console.log(`   Storage failures: ${results.failed}`);

    // Show duplicate details
    if (results.duplicates.length > 0) {
      console.log(`\n🔍 Duplicate Details:`);
      results.duplicates.forEach((dup, index) => {
        if (index < 5) { // Show first 5 duplicates
          const best = dup.duplicates[0];
          console.log(`   ${index + 1}. "${dup.question.title}"`);
          console.log(`      Similar to: "${best.question.title}" (${(best.similarity * 100).toFixed(1)}%)`);
        }
      });
      if (results.duplicates.length > 5) {
        console.log(`   ... and ${results.duplicates.length - 5} more duplicates`);
      }
    }

    return results;

  } catch (error) {
    console.error('❌ Error in semantic deduplication:', error);
    throw error;
  } finally {
    // Clean up
    deduplicator.clearCache();
  }
}

/**
 * Add embeddings to existing questions (migration utility)
 * @param {Object} options - Migration options
 * @returns {Promise<Object>} - Migration result
 */
async function addEmbeddingsToExistingQuestions(options = {}) {
  const deduplicator = new SemanticDeduplicator(options);
  const results = {
    processed: 0,
    updated: 0,
    errors: 0
  };

  console.log('🔄 Starting embedding migration for existing questions...');

  try {
    // Scan questions without embeddings
    const params = {
      TableName: TABLES.QUESTIONS,
      FilterExpression: 'attribute_not_exists(embedding)',
      ProjectionExpression: 'id, #h, title, #qt, categoryId, choices, #ca, #car, #img',
      ExpressionAttributeNames: {
        '#h': 'hash',
        '#qt': 'question-type',
        '#ca': 'correct-answer',
        '#car': 'correct-answer-index',
        '#img': 'image-hint'
      }
    };

    let lastEvaluatedKey = null;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const result = await dynamoDb.scan(params).promise();
      const questions = result.Items || [];

      console.log(`📋 Processing batch of ${questions.length} questions...`);

      for (const question of questions) {
        try {
          const embedding = await deduplicator.generateQuestionEmbedding(question);

          if (embedding) {
            // Update question with embedding
            const updateParams = {
              TableName: TABLES.QUESTIONS,
              Key: {
                id: question.id,
                hash: question.hash
              },
              UpdateExpression: 'SET embedding = :embedding, embeddingVersion = :version, embeddingGeneratedAt = :timestamp',
              ExpressionAttributeValues: {
                ':embedding': embedding,
                ':version': deduplicator.embeddingModel,
                ':timestamp': new Date().toISOString()
              }
            };

            await dynamoDb.update(updateParams).promise();
            results.updated++;
          } else {
            results.errors++;
          }

          results.processed++;

          if (results.processed % 50 === 0) {
            console.log(`📊 Migration progress: ${results.processed} processed, ${results.updated} updated`);
          }

        } catch (error) {
          console.error(`❌ Error updating question ${question.id}:`, error.message);
          results.errors++;
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;

    } while (lastEvaluatedKey);

    console.log(`✅ Embedding migration complete: ${results.updated} questions updated, ${results.errors} errors`);
    return results;

  } catch (error) {
    console.error('❌ Error in embedding migration:', error);
    throw error;
  } finally {
    deduplicator.clearCache();
  }
}

module.exports = {
  storeQuestionsWithSemanticDeduplication,
  addEmbeddingsToExistingQuestions,
  getQuestionsWithEmbeddingsByCategory,
  getQuestionsByCategory,
  SemanticDeduplicator
};
