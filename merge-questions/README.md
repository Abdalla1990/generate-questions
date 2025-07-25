# Questions Merger

This module merges questions from multiple categories for a specific user by leveraging Redis-based set allocation and DynamoDB storage.

## Overview

The Questions Merger performs the following operations:

1. **User Allocation Check**: Finds user's already allocated sets in Redis to avoid re-fetching
2. **Set Allocation**: Fetches new sets for each requested category (if needed) and stores them in user allocations
3. **Question ID Retrieval**: Fetches question IDs from the corresponding sets in DynamoDB (`question_sets` table)
4. **Question Fetching**: Retrieves actual questions from the questions table in DynamoDB
5. **Merge & Return**: Returns all questions from all chosen categories with source tracking

## Features

- ✅ **Redis Integration**: Uses existing queue management system for set allocation
- ✅ **Cache Optimization**: Avoids re-fetching already allocated sets
- ✅ **Automatic Cache Eviction**: Applies cache policies during allocation
- ✅ **DynamoDB Batch Operations**: Efficient question retrieval using batch gets
- ✅ **Error Handling**: Graceful handling of missing sets or questions
- ✅ **Source Tracking**: Each question includes source category and set information
- ✅ **CLI Interface**: Command-line tool for easy testing and usage

## Usage

### Programmatic Usage

```javascript
const QuestionsMerger = require('./questions-merger');

const merger = new QuestionsMerger();
await merger.initialize();

const result = await merger.mergeQuestionsForUser('user123', ['science', 'history', 'math']);

console.log(`Retrieved ${result.summary.totalQuestions} questions from ${result.summary.successfulCategories} categories`);

await merger.disconnect();
```

### CLI Usage

```bash
# Merge questions from multiple categories
node cli.js user123 science,history,math

# Get user allocation summary
node cli.js user456 --summary

# Show help
node cli.js --help
```

### npm Script Usage

```bash
# Using the npm script
npm run merge-questions user123 science,history
```

## Data Flow

```
1. User Request (userId + categoryIds)
   ↓
2. Redis: Check existing allocations
   ↓
3. Redis: Allocate new sets (if needed) + Apply cache eviction
   ↓
4. DynamoDB (question_sets): Fetch question IDs from sets
   ↓
5. DynamoDB (questions): Batch fetch actual questions
   ↓
6. Merge & Return with source tracking
```

## Configuration

The merger uses the same environment configuration as the question generation system:

- **Redis**: Connection details from `.env.dev` or `.env`
- **DynamoDB**: AWS credentials and region configuration
- **Tables**: 
  - `question_sets` - Contains question set definitions
  - `questions` (or `DYNAMODB_TABLE_NAME`) - Contains actual questions

## Response Format

```javascript
{
  userId: "user123",
  categories: ["science", "history"],
  sets: {
    "science": "set_12345",
    "history": "set_67890"
  },
  questions: [
    {
      id: "q1",
      question: "What is photosynthesis?",
      // ... other question fields
      sourceCategory: "science",
      sourceSet: "set_12345"
    },
    // ... more questions
  ],
  summary: {
    totalCategories: 2,
    successfulCategories: 2,
    totalQuestions: 25,
    categoriesWithNoSets: [],
    categoriesWithErrors: []
  }
}
```

## Error Handling

- **No Available Sets**: Categories without available sets are logged and tracked
- **Missing Questions**: Handles cases where sets exist but questions are missing
- **DynamoDB Errors**: Graceful handling of database connection issues
- **Redis Errors**: Proper error handling for cache operations

## Dependencies

- **AWS SDK**: For DynamoDB operations
- **Redis Client**: Via the existing QueueManager
- **dotenv**: For environment configuration
- **Existing Infrastructure**: Leverages the question generation system's setup

## Cache Integration

The merger automatically applies the cache eviction policy during set allocation:
- **Maximum Sets**: Removes oldest sets if user has >10 per category
- **Age Limit**: Removes sets older than 2 months
- **Timestamp Tracking**: Uses individual allocation timestamps for precise eviction
