#!/usr/bin/env node
// migrate-embeddings.js - Utility to add embeddings to existing questions
require('dotenv').config({ path: '../../.env.dev' });

const { addEmbeddingsToExistingQuestions } = require('./enhanced-storage');
const { getConfigInfo } = require('../../shared/dynamodb-config');

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Starting embedding migration for existing questions...\n');

  // Show configuration
  const config = getConfigInfo();
  console.log('📋 Configuration:');
  console.log(`   Region: ${config.region}`);
  console.log(`   Table: ${config.tables.QUESTIONS}`);
  console.log(`   Environment: ${config.isLocal ? 'Local DynamoDB' : 'AWS DynamoDB'}`);
  console.log(`   Endpoint: ${config.endpoint}\n`);

  try {
    const startTime = Date.now();

    // Run migration with options
    const result = await addEmbeddingsToExistingQuestions({
      batchSize: 25, // Process in smaller batches to avoid rate limits
      delay: 1000,   // 1 second delay between batches
      similarityThreshold: 0.85,
      embeddingModel: 'text-embedding-3-small'
    });

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n✅ Migration completed successfully!');
    console.log('==========================================');
    console.log(`Total questions processed: ${result.processed}`);
    console.log(`Questions updated with embeddings: ${result.updated}`);
    console.log(`Errors encountered: ${result.errors}`);
    console.log(`Migration duration: ${duration} seconds`);
    console.log('==========================================\n');

    if (result.errors > 0) {
      console.log('⚠️  Some questions could not be processed. Check the logs for details.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--delay':
        options.delay = parseInt(args[++i]);
        break;
      case '--threshold':
        options.similarityThreshold = parseFloat(args[++i]);
        break;
    }
  }

  return options;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
Embedding Migration Utility
============================

This utility adds semantic embeddings to existing questions in the database
to enable semantic duplicate detection.

Usage:
  node migrate-embeddings.js [options]

Options:
  --help, -h          Show this help message
  --dry-run          Show what would be done without making changes
  --batch-size <n>   Number of questions to process per batch (default: 25)
  --delay <ms>       Delay between batches in milliseconds (default: 1000)
  --threshold <n>    Similarity threshold for duplicates (default: 0.85)

Examples:
  node migrate-embeddings.js
  node migrate-embeddings.js --batch-size 10 --delay 2000
  node migrate-embeddings.js --dry-run

Environment:
  Make sure your .env.dev file contains:
  - OPENAI_API_KEY: Your OpenAI API key
  - DYNAMODB_TABLE_NAME: Your DynamoDB table name (optional)
  - AWS credentials if using production DynamoDB
`);
}

// Run if called directly
if (require.main === module) {
  const options = parseArgs();
  main(options);
}

module.exports = {
  main,
  parseArgs,
  showHelp
};
