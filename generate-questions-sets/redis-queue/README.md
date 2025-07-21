# Redis Queue for Question Sets

This module provides Redis-based queue management for tracking available question sets across different categories.

## Overview

The Redis queue system tracks newly generated question sets and maintains a FIFO (First In, First Out) queue for each category. This enables efficient distribution and consumption of question sets.

## Architecture

### Components

1. **QueueManager** (`queue-manager.js`)
   - Low-level Redis operations
   - Queue management (add, retrieve, clear)
   - Health checks and connection handling

2. **SetTracker** (`set-tracker.js`)
   - High-level interface for set tracking
   - Integration with question set generation
   - Availability monitoring

3. **CLI** (`cli.js`)
   - Command-line interface for queue management
   - Status monitoring and debugging

## Redis Data Structure

### Queue Keys
- `question_sets:queue:{categoryId}` - List containing set IDs for each category
- `question_sets:meta:{categoryId}` - Hash containing metadata for each category

### Metadata Fields
- `total_available` - Number of sets currently available
- `last_updated` - Timestamp of last update
- `last_batch_size` - Size of the last batch added

## Usage

### Integration with Question Generation

The Redis queue is automatically integrated into the main question generation script:

```javascript
// Generate 5 sets of 6 questions each, with Redis queue enabled
await generateQuestionSets(5, 6, true);

// Generate without Redis queue
await generateQuestionSets(5, 6, false);
```

### Programmatic Usage

```javascript
const SetTracker = require('./redis-queue/set-tracker');

const setTracker = new SetTracker();
await setTracker.initialize();

// Get next available set for a category
const setId = await setTracker.getNextAvailableSet('tech');

// Check availability for a category
const availability = await setTracker.getCategoryAvailability('tech');
console.log(`Available sets: ${availability.count}`);

// Get status for all categories
const allStatuses = await setTracker.getAllCategoriesAvailability();

await setTracker.cleanup();
```

### CLI Usage

```bash
# Show status for all categories
node redis-queue/cli.js status

# Show status for specific category
node redis-queue/cli.js status tech

# Get next available set for category
node redis-queue/cli.js next tech

# Clear queue for specific category
node redis-queue/cli.js clear tech

# Show detailed queue information
node redis-queue/cli.js info

# Check Redis health
node redis-queue/cli.js health
```

## Environment Variables

Add these to your `.env` file:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## Installation

The Redis queue requires the `redis` npm package:

```bash
npm install redis
```

## Features

### Queue Management
- **FIFO Processing**: First sets added are first to be retrieved
- **Category Isolation**: Each category maintains its own queue
- **Metadata Tracking**: Tracks queue size, last update time, and batch information

### Error Handling
- **Graceful Degradation**: If Redis is unavailable, the system continues without queue functionality
- **Connection Recovery**: Automatic reconnection handling
- **Health Monitoring**: Built-in health checks and status reporting

### Monitoring
- **Real-time Status**: View current queue state for all categories
- **Historical Data**: Track when sets were added and batch sizes
- **CLI Tools**: Easy command-line access for debugging and monitoring

## Integration Flow

1. **Question Generation**: New sets are generated and stored in DynamoDB
2. **Queue Addition**: Set IDs are automatically added to the appropriate Redis queue
3. **Consumption**: External systems can retrieve set IDs from the queue
4. **Tracking**: Metadata is updated to reflect current queue state

## Benefits

- **Scalability**: Distribute question sets across multiple consumers
- **Reliability**: Redis persistence ensures queue state is maintained
- **Performance**: Fast retrieval of available sets without database queries
- **Monitoring**: Real-time visibility into set availability
- **Flexibility**: Easy integration with existing workflows
