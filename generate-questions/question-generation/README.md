# Question Generation Module

This module provides a modular approach to generating Arabic trivia questions using OpenAI and various media processing services.

## Structure

```
question-generation/
├── index.js                        # Main entry point and orchestration
├── config.js                       # Configuration and constants
├── question-types-config.json      # Single source of truth for question types
├── manage-question-types.js        # Utility to manage question types
├── generator.js                    # OpenAI generation logic
├── processing.js                   # Media processing (images/audio)
├── validation.js                   # Question validation
└── distribution.js                 # Distribution analysis and reporting
```

## Question Types Configuration

### Single Point of Control

The `question-types-config.json` file serves as the **single source of truth** for all question type definitions. You can:

- ✅ Enable/disable any question type
- 🎛️ Configure media processing settings
- 📋 Define schemas and validation rules
- 🎯 Set allowed contexts (e.g., image contexts)
- 💰 Configure cost tracking

### Managing Question Types

Use the management utility to control which question types to generate:

```bash
# Check current status
node manage-question-types.js status

# Enable a specific type
node manage-question-types.js enable voice

# Disable a specific type
node manage-question-types.js disable video

# Enable only specific types (disables all others)
node manage-question-types.js enable-only "multiple-choice,image,range"
```

### Available Question Types

| Type | Status | Media | Description |
|------|--------|-------|-------------|
| `multiple-choice` | ✅ Default ON | 📝 Text | Standard multiple choice questions |
| `image` | ✅ Default ON | 🎬 Image | Image recognition questions |
| `voice` | ✅ Default ON | 🎬 Audio | Audio recognition questions |
| `range` | ✅ Default ON | 📝 Text | Numeric range questions |
| `video` | ❌ Default OFF | 🎬 Video | Video recognition questions |

### Configuration Features

#### Dynamic Distribution
- Questions are automatically distributed evenly across **enabled types only**
- No hardcoded question type lists
- Adapts to your configuration automatically

#### Image Context Control
- Restrict image questions to specific contexts: `arabic-calligraphy`, `plant`, `country`
- Easily modify allowed contexts in the config file

#### Media Service Configuration
- Choose between DALL-E and Stability AI for images
- Configure OpenAI TTS or ElevenLabs for audio
- Cost tracking per service

## Files Overview

### `question-types-config.json`
**THE SINGLE SOURCE OF TRUTH** for:
- Question type definitions and schemas
- Enable/disable flags for each type
- Media processing configuration
- Allowed contexts and validation rules
- Cost settings per media service

### `config.js`
- Loads and exposes the question types configuration
- Provides utility functions for enabled types
- Lazy-loads generators to avoid requiring API keys
- Maintains backward compatibility

### `manage-question-types.js`
- Command-line utility for configuration management
- Enable/disable question types
- Check configuration status
- Bulk operations (enable-only)

### `generator.js`
- Dynamically builds prompts based on enabled types
- Uses only enabled question types in generation
- Adapts distribution requirements automatically

### `processing.js`
- Processes media content for enabled types
- Question type-specific processing
- Statistics tracking for media generation

### `validation.js`
- Validates generated questions
- Checks for disabled types in output
- Ensures only enabled types are included

### `distribution.js`
- Analyzes distribution of enabled types only
- Reports on disabled types found in output
- Adaptive analysis based on configuration

## Usage

### From other scripts:
```javascript
const { generateGPTQuestions } = require('./question-generation');

// Generate 20 questions using currently enabled types
await generateGPTQuestions(20);
```

### Direct execution:
```bash
# Generate questions with current configuration
node question-generation/index.js

# Configure question types first
node question-generation/manage-question-types.js enable-only "multiple-choice,image"

# Then generate
node question-generation/index.js
```

### Configuration Examples:

```bash
# Generate only text-based questions
node manage-question-types.js enable-only "multiple-choice,range"

# Generate only media-rich questions  
node manage-question-types.js enable-only "image,voice"

# Enable all except video
node manage-question-types.js disable video

# Check what's currently enabled
node manage-question-types.js status
```

## Environment Variables

- `OPENAI_API_KEY` - Required for question generation
- `STABILITY_API_KEY` - Required for Stability AI image generation
- `USE_DALLE` - Set to 'true' to use DALL-E instead of Stability AI
- `NUM_QUESTIONS` - Number of questions to generate (default: 10)

## Dependencies

The module uses the same dependencies as the original generate.js:
- `openai` - OpenAI API client
- Node.js built-in modules (`fs`, `path`)

## Output

- Generated questions are saved to `questions-{timestamp}.json`
- **Execution report** exported to `execution-report-{timestamp}.json`
- Comprehensive cost and statistics reporting
- Distribution analysis for question types and categories
- Media processing statistics
- **Real-time execution time tracking** with progress indicators

### Execution Report Structure

The execution report includes:

```json
{
  "metadata": {
    "timestamp": "2025-07-18T22:49:40.797Z",
    "startTime": "2025-07-18T22:49:36.289Z", 
    "endTime": "2025-07-18T22:49:40.797Z",
    "executionTimeMs": 4508,
    "executionTimeFormatted": "4s",
    "questionsRequested": 10,
    "questionsGenerated": 8
  },
  "costs": {
    "openai": { "total": 0.1234, "details": "..." },
    "media": { "total": 0.0456, "images": 0.0300, "audio": 0.0156 },
    "grandTotal": 0.169
  },
  "statistics": {
    "media": {
      "images": { "generated": 3, "failed": 1, "successRate": "75.0%" },
      "audio": { "generated": 2, "failed": 0, "successRate": "100.0%" }
    }
  },
  "output": {
    "questionsFile": "/path/to/questions-timestamp.json",
    "reportFile": "/path/to/execution-report-timestamp.json"
  }
}
```

## Features

- **Modular Design**: Each aspect of generation is in its own module
- **No Circular Dependencies**: Clean dependency structure
- **Error Handling**: Robust error handling with fallbacks
- **Cost Tracking**: Detailed cost reporting for all services
- **Validation**: Comprehensive question validation
- **Backward Compatibility**: Original `generate.js` still works
- **⏱️ Execution Time Tracking**: Real-time progress monitoring with formatted time display
- **📋 Execution Reports**: Comprehensive JSON reports with metadata, costs, and statistics
- **🎯 Success Rate Monitoring**: Track success/failure rates for media generation

## Usage Examples

### Basic Generation

```bash
# Generate 10 questions with execution tracking
node index.js

# Generate specific number of questions
NUM_QUESTIONS=25 node index.js
```

### With Custom Configuration

```bash
# Enable only specific question types
node manage-question-types.js enable-only "multiple-choice,image"

# Generate questions
node index.js

# Check execution results
cat execution-report-*.json | jq '.metadata.executionTimeFormatted'
```

### Testing Execution Tracking

```bash
# Test execution time tracking functionality
node test-execution-tracking.js
```
