// database.js - DynamoDB connection and configuration
const {
  dynamoDb,
  dynamoDbAdmin,
  TABLES,
  ensureQuestionsTableExists
} = require('../../../shared/dynamodb-config');

/**
 * Create the questions table if it doesn't exist
 * @returns {Promise<boolean>} - Returns true if table exists or was created successfully
 */
async function ensureTableExists() {
  return ensureQuestionsTableExists();
}

/**
 * Test the DynamoDB connection
 * @returns {Promise<boolean>} - Returns true if connection is successful
 */
async function testConnection() {
  try {
    await dynamoDbAdmin.listTables({ Limit: 1 }).promise();
    console.log('✅ DynamoDB connection successful');
    return true;
  } catch (error) {
    console.error('❌ DynamoDB connection failed:', error.message);
    throw error;
  }
}

/**
 * Put an item into the DynamoDB table
 * @param {Object} item - The item to store
 * @returns {Promise<Object>} - Returns the result of the put operation
 */
async function putItem(item) {
  const params = {
    TableName: TABLES.QUESTIONS,
    Item: item,
    // Prevent overwriting existing items with the same id
    ConditionExpression: 'attribute_not_exists(id)'
  };

  try {
    const result = await dynamoDb.put(params).promise();
    return result;
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      // Item with same id and hash already exists
      throw new Error(`Question with id '${item.id}' and hash '${item.hash}' already exists`);
    }
    throw error;
  }
}

/**
 * Get an item from the DynamoDB table by id
 * @param {string} id - The question ID
 * @param {string} hash - The question hash (optional, for backwards compatibility)
 * @returns {Promise<Object|null>} - Returns the item or null if not found
 */
async function getItem(id, hash = null) {
  const params = {
    TableName: TABLES.QUESTIONS,
    Key: { id }
  };

  try {
    const result = await dynamoDb.get(params).promise();
    return result.Item || null;
  } catch (error) {
    console.error('❌ Error getting item from DynamoDB:', error);
    throw error;
  }
}

/**
 * Query items by hash (using the GSI)
 * @param {string} hash - The question hash
 * @returns {Promise<Array>} - Returns array of matching items
 */
async function getItemsByHash(hash) {
  const params = {
    TableName: TABLES.QUESTIONS,
    IndexName: 'hash-index',
    KeyConditionExpression: '#hash = :hash',
    ExpressionAttributeNames: {
      '#hash': 'hash'
    },
    ExpressionAttributeValues: {
      ':hash': hash
    }
  };

  try {
    const result = await dynamoDb.query(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error('❌ Error querying items by hash:', error);
    throw error;
  }
}

/**
 * Batch write items to DynamoDB
 * @param {Array} items - Array of items to write
 * @returns {Promise<Object>} - Returns the result of the batch write
 */
async function batchPutItems(items) {
  if (!items || items.length === 0) {
    return { processedItems: 0 };
  }

  // DynamoDB batch write has a limit of 25 items
  const batchSize = 25;
  let processedItems = 0;
  const unprocessedItems = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const params = {
      RequestItems: {
        [TABLES.QUESTIONS]: batch.map(item => ({
          PutRequest: {
            Item: item
          }
        }))
      }
    };

    try {
      const result = await dynamoDb.batchWrite(params).promise();
      processedItems += batch.length;

      // Handle unprocessed items
      if (result.UnprocessedItems && result.UnprocessedItems[TABLES.QUESTIONS]) {
        unprocessedItems.push(...result.UnprocessedItems[TABLES.QUESTIONS]);
      }
    } catch (error) {
      console.error(`❌ Error in batch write (batch ${Math.floor(i / batchSize) + 1}):`, error);
      throw error;
    }
  }

  return {
    processedItems,
    unprocessedItems: unprocessedItems.length,
    totalItems: items.length
  };
}

/**
 * Load questions from a JSON file and store them in DynamoDB
 * @param {string} jsonFilePath - Path to the JSON file containing questions
 * @returns {Promise<Object>} - Returns storage results
 */
async function storeQuestionsFromFile(jsonFilePath) {
  const fs = require('fs');
  const path = require('path');
  const { storeQuestions } = require('../storage');

  try {
    // Check if file exists
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error(`File not found: ${jsonFilePath}`);
    }

    console.log(`📄 Loading questions from: ${jsonFilePath}`);

    // Read and parse JSON file
    const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
    const questions = JSON.parse(fileContent);

    // Validate that it's an array
    if (!Array.isArray(questions)) {
      throw new Error('JSON file must contain an array of questions');
    }

    console.log(`📦 Found ${questions.length} questions in file`);

    // Store questions using existing storage function
    const result = await storeQuestions(questions);

    console.log(`✅ Storage complete: ${result.stored} stored, ${result.skipped} skipped, ${result.failed} failed`);

    return result;

  } catch (error) {
    console.error('❌ Error storing questions from file:', error.message);
    throw error;
  }
}

module.exports = {
  dynamoDb,
  ensureTableExists,
  testConnection,
  putItem,
  getItem,
  getItemsByHash,
  batchPutItems,
  storeQuestionsFromFile,
  TABLES
};

/**
 * Main function for testing database functionality
 * Usage: node database.js [path-to-json-file]
 */
async function main() {
  try {
    // Get JSON file path from command line arguments
    const jsonFilePath = process.argv[2];

    if (!jsonFilePath) {
      console.log('Usage: node database.js <path-to-json-file>');
      console.log('Example: node database.js ../questions-2025-07-20T10-30-00-000Z.json');
      process.exit(1);
    }

    console.log('🚀 Starting database storage test...');

    // Test connection first
    await testConnection();

    // Ensure table exists
    await ensureTableExists();

    // Store questions from file
    const result = await storeQuestionsFromFile(jsonFilePath);

    console.log('\n📊 Final Results:');
    console.log('==================');
    console.log(`Total questions: ${result.total}`);
    console.log(`Successfully stored: ${result.stored}`);
    console.log(`Skipped (duplicates): ${result.skipped}`);
    console.log(`Failed: ${result.failed}`);
    console.log('==================\n');

    console.log('✅ Database storage test completed successfully!');

  } catch (error) {
    console.error('❌ Database storage test failed:', error.message);
    process.exit(1);
  }
}

// Run main function if this file is executed directly
if (require.main === module) {
  main();
}
