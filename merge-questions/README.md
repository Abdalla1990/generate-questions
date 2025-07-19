# Question Merge Tool

A comprehensive tool to merge multiple question JSON files into a single mega questions file, handling duplicates and ensuring consistent formatting.

## Features

- ✅ **Duplicate Detection**: Removes duplicate questions based on content analysis
- 🔧 **Structure Normalization**: Ensures all questions follow the correct schema
- 📊 **Detailed Statistics**: Provides comprehensive merge statistics
- 🔄 **Legacy Support**: Handles old question formats and field mappings
- 📁 **Smart File Discovery**: Automatically finds all question files in the workspace
- 🆔 **ID Management**: Generates unique IDs for questions that don't have them
- 📋 **Validation**: Validates question structure and reports issues

## Usage

### Basic Usage

```bash
# Run from the project root directory
cd /path/to/your/trivia-game
node scripts/merge-questions/merge-questions.js
```

This will:
1. Find all `questions-*.json` files in the root directory and `public/` folder
2. Load and validate each file
3. Remove duplicates and normalize structures
4. Generate a merged file: `merged-questions-{timestamp}.json`

### Output

The script produces:
- **Merged Questions File**: `merged-questions-{timestamp}.json` with all unique questions
- **Console Statistics**: Detailed report of the merge process
- **Warning Messages**: Issues found during processing

## Duplicate Detection

Questions are considered duplicates if they have:
- Same title (case-insensitive, trimmed)
- Same question type
- Same choices (for multiple-choice questions)
- Same range parameters (for range questions)

## Structure Normalization

The tool normalizes questions to ensure they follow the correct schema:

### Multiple Choice Questions
```json
{
  "id": "q1",
  "categoryId": "cat1",
  "points": 300,
  "title": "Question text?",
  "question-type": "multiple-choice",
  "choices": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "correct-answer-index": 0
}
```

### Range Questions
```json
{
  "id": "q2",
  "categoryId": "cat2",
  "points": 500,
  "title": "Range question?",
  "question-type": "range",
  "min-value": 1000,
  "max-value": 2000,
  "correct-answer": 1500,
  "range": 50,
  "unit": "متر"
}
```

### Image Questions
```json
{
  "id": "q3",
  "categoryId": "cat3",
  "points": 400,
  "title": "Image question?",
  "question-type": "image",
  "choices": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "correct-answer-index": 1,
  "imageUrl": "path/to/image.jpg"
}
```

## Files Processed

The tool searches for and processes:
- All `questions-*.json` files in the root directory
- All `questions*.json` files in the `public/` directory
- Excludes configuration files like `questions-required-fields.json`

## Legacy Support

The tool handles legacy formats by:
- Mapping `correct-answer-idx` to `correct-answer-index`
- Validating and normalizing point values (100, 300, 500)
- Adding missing required fields where possible
- Reporting issues for manual review

## Example Output

```
🚀 Question Merge Tool
======================

Working directory: /path/to/trivia-game
Output file: merged-questions-2025-07-18T22-55-30-123Z.json

📁 Found 12 question files:
   - questions-2025-07-14T01-09-27-359Z.json
   - questions-2025-07-15T01-58-16-214Z.json
   - [...]

📊 Total questions found: 350

🔄 Processing questions...

📝 Processing questions-2025-07-14T01-09-27-359Z.json...
   🔄 Duplicate found: "متى وقعت معركة القادسية؟"
      Sources: questions-2025-07-14T01-09-27-359Z.json, questions-2025-07-15T01-58-16-214Z.json

💾 Writing merged questions to merged-questions-2025-07-18T22-55-30-123Z.json...

📊 Merge Complete! Statistics:
================================
Files processed: 12
Questions found: 350
Questions processed: 350
Duplicates removed: 45
Questions normalized: 23
Invalid questions skipped: 2
Final unique questions: 305
Reduction: 12.9%
================================

✅ Merge completed successfully!
📁 Output: merged-questions-2025-07-18T22-55-30-123Z.json
📊 305 unique questions saved
```

## Error Handling

The tool handles various error conditions:
- Invalid JSON files (skipped with warning)
- Missing required fields (reported but processed)
- Invalid question structures (skipped with warning)
- File access issues (reported and handled gracefully)

## Configuration

You can modify the `CONFIG` object in the script to:
- Add support for new question types
- Change duplicate detection logic
- Modify file search patterns
- Customize normalization rules

## Integration

The merge tool is designed to work with:
- The question generation system
- The trivia game frontend
- The validation tools
- The statistics analysis tools

It maintains full compatibility with the existing question schema and can be used as part of automated workflows.

## Quick Start Guide

### 1. Basic Merge
```bash
cd /path/to/your/trivia-game
node scripts/merge-questions/merge-questions.js
```
**Output**: `merged-questions-{timestamp}.json`

### 2. Enhanced Merge (Recommended)
```bash
node scripts/merge-questions/merge-utility.js
```
**Output**: Complete package with backup, analysis report, and merged questions

### 3. Custom Options
```bash
# Custom output directory
node scripts/merge-questions/merge-utility.js --output-dir my-merge

# Skip backup and reports (fastest)
node scripts/merge-questions/merge-utility.js --no-backup --no-report

# Help
node scripts/merge-questions/merge-utility.js --help
```

### 4. Testing
```bash
# Run all tests
node scripts/merge-questions/test-merge.js
```

## Integration with Your Workflow

The merge tool is designed to work seamlessly with your Arabic trivia game:

1. **Question Generation**: Generate questions using the question generation system
2. **Accumulation**: Multiple generation runs create separate timestamped files
3. **Merging**: Use this tool to consolidate all questions into one file
4. **Deployment**: Use the merged file in your trivia game frontend

## Automation

You can automate the merge process by:
- Running it after each question generation batch
- Setting up a scheduled task to merge daily/weekly
- Integrating it into your deployment pipeline
- Using it as part of your backup strategy

The tool maintains full compatibility with your existing question schema and can handle any mix of old and new question formats.
