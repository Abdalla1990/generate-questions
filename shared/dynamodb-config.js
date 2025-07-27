// shared/dynamodb-config.js - Unified DynamoDB configuration
const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');

/**
 * Load environment variables with consistent path resolution
 * @param {string} relativePath - Relative path from the caller to the project root
 */
function loadEnvironment(relativePath = '../') {
  const envPath = path.join(__dirname, relativePath, '.env.dev');
  const fallbackEnvPath = path.join(__dirname, relativePath, '.env');

  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  } else if (fs.existsSync(fallbackEnvPath)) {
    require('dotenv').config({ path: fallbackEnvPath });
  }
}

// Load environment variables
loadEnvironment();

// DynamoDB local configuration (for development)
const localConfig = {
  region: "us-east-1",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy",
  }
};

// Table names
const TABLES = {
  QUESTIONS: process.env.DYNAMODB_TABLE_NAME || 'questions',
  QUESTION_SETS: 'question_sets'
};

// AWS region configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Configure AWS SDK with conditional production/local settings
const isLocal =
  process.env.NODE_ENV === 'development' ||
  !process.env.AWS_ACCESS_KEY_ID ||
  !process.env.AWS_SECRET_ACCESS_KEY;

const awsConfig = isLocal
  ? localConfig
  : {
    region: AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  };

AWS.config.update(awsConfig);

// Create DynamoDB clients
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const dynamoDbAdmin = new AWS.DynamoDB();

/**
 * Create a DynamoDB table if it doesn't exist
 * @param {string} tableName - Name of the table to create
 * @param {Object} tableConfig - Table configuration object
 * @returns {Promise<boolean>} - Returns true if table exists or was created successfully
 */
async function ensureTableExists(tableName, tableConfig) {
  try {
    // Check if table exists
    await dynamoDbAdmin.describeTable({ TableName: tableName }).promise();
    console.log(`✅ DynamoDB table '${tableName}' already exists`);
    return true;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.log(`🔧 Creating DynamoDB table '${tableName}'...`);

      const tableParams = {
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        ...tableConfig
      };

      await dynamoDbAdmin.createTable(tableParams).promise();
      await dynamoDbAdmin.waitFor('tableExists', { TableName: tableName }).promise();

      console.log(`✅ DynamoDB table '${tableName}' created successfully`);
      return true;
    } else {
      console.error(`❌ Error checking/creating DynamoDB table '${tableName}':`, error);
      throw error;
    }
  }
}

/**
 * Ensure the questions table exists
 * @returns {Promise<boolean>}
 */
async function ensureQuestionsTableExists() {
  const tableConfig = {
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'categoryId', AttributeType: 'S' },
      { AttributeName: 'hash', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'category-index',
        KeySchema: [
          { AttributeName: 'categoryId', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      },
      {
        IndexName: 'hash-index',
        KeySchema: [
          { AttributeName: 'hash', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ]
  };

  return ensureTableExists(TABLES.QUESTIONS, tableConfig);
}

/**
 * Ensure the question_sets table exists
 * @returns {Promise<boolean>}
 */
async function ensureQuestionSetsTableExists() {
  const tableConfig = {
    KeySchema: [
      { AttributeName: 'id', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'category_id', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'category-index',
        KeySchema: [
          { AttributeName: 'category_id', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }
    ]
  };

  return ensureTableExists(TABLES.QUESTION_SETS, tableConfig);
}

/**
 * Get DynamoDB configuration info (for debugging)
 * @returns {Object} - Configuration information
 */
function getConfigInfo() {
  return {
    region: AWS_REGION,
    tables: TABLES,
    isLocal: !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: awsConfig.endpoint || 'AWS Default'
  };
}

module.exports = {
  // Clients
  dynamoDb,
  dynamoDbAdmin,

  // Table names
  TABLES,

  // Utility functions
  ensureTableExists,
  ensureQuestionsTableExists,
  ensureQuestionSetsTableExists,
  getConfigInfo,
  loadEnvironment,

  // Configuration
  AWS_REGION,
  awsConfig
};
