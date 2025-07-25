// semantic-deduplicator.js - Semantic duplicate detection using OpenAI embeddings
const { OpenAI } = require('openai');
const crypto = require('crypto');

class SemanticDeduplicator {
  constructor(options = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.embeddingCache = new Map(); // Cache embeddings in memory
    this.similarityThreshold = options.similarityThreshold || 0.88;
    this.embeddingModel = options.embeddingModel || 'text-embedding-3-small';
    this.maxCacheSize = options.maxCacheSize || 1000;

    console.log(`🧠 Semantic deduplicator initialized with threshold: ${this.similarityThreshold}`);
  }

  /**
   * Generate semantic embedding for question content
   * @param {Object} question - The question object
   * @returns {Promise<Array|null>} - Embedding vector or null if failed
   */
  async generateQuestionEmbedding(question) {
    const contentForEmbedding = this.extractQuestionContent(question);
    const cacheKey = this.getCacheKey(contentForEmbedding);

    // Check cache first
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.embeddingModel,
        input: contentForEmbedding,
        encoding_format: "float"
      });

      const embedding = response.data[0].embedding;

      // Cache with size limit
      if (this.embeddingCache.size >= this.maxCacheSize) {
        // Remove oldest entries (simple FIFO)
        const firstKey = this.embeddingCache.keys().next().value;
        this.embeddingCache.delete(firstKey);
      }

      this.embeddingCache.set(cacheKey, embedding);

      return embedding;
    } catch (error) {
      console.error('❌ Error generating embedding:', error.message);
      return null;
    }
  }

  /**
   * Extract semantic content from question for embedding
   * @param {Object} question - The question object
   * @returns {string} - Content string for embedding
   */
  extractQuestionContent(question) {
    let content = question.title || '';

    // Add answer context for better semantic understanding
    switch (question['question-type']) {
      case 'multiple-choice':
        if (question.choices && question['correct-answer-index'] !== undefined) {
          const correctAnswer = question.choices[question['correct-answer-index']];
          content += ` الجواب: ${correctAnswer}`;
        }
        break;
      case 'range':
        if (question['correct-answer']) {
          content += ` الجواب: ${question['correct-answer']}`;
          if (question.unit) {
            content += ` ${question.unit}`;
          }
        }
        break;
      case 'image':
        if (question['image-hint']) {
          content += ` صورة: ${question['image-hint']}`;
        }
        break;
    }

    // Add category context
    if (question.categoryId) {
      content += ` فئة: ${question.categoryId}`;
    }

    return content.trim();
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {Array} embedding1 - First embedding vector
   * @param {Array} embedding2 - Second embedding vector
   * @returns {number} - Similarity score between 0 and 1
   */
  calculateCosineSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Check for semantic duplicates in a list of existing questions
   * @param {Object} question - The new question to check
   * @param {Array} existingQuestions - Array of existing questions with embeddings
   * @returns {Promise<Array>} - Array of duplicate matches
   */
  async findSemanticDuplicates(question, existingQuestions) {
    const questionEmbedding = await this.generateQuestionEmbedding(question);
    if (!questionEmbedding) {
      console.log('⚠️  Could not generate embedding for question, skipping semantic check');
      return [];
    }

    const duplicates = [];

    for (const existing of existingQuestions) {
      if (!existing.embedding) continue; // Skip questions without embeddings

      const similarity = this.calculateCosineSimilarity(
        questionEmbedding,
        existing.embedding
      );

      if (similarity >= this.similarityThreshold) {
        duplicates.push({
          question: existing,
          similarity: similarity,
          reason: 'semantic_duplicate',
          details: {
            newQuestion: question.title,
            existingQuestion: existing.title,
            newId: question.id,
            existingId: existing.id
          }
        });
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Batch process questions for duplicate detection
   * @param {Array} questions - Array of questions to process
   * @param {Array} existingQuestions - Array of existing questions to check against
   * @returns {Promise<Object>} - Processing results
   */
  async batchProcessQuestions(questions, existingQuestions) {
    const results = {
      processed: [],
      duplicates: [],
      errors: []
    };

    console.log(`🔍 Processing ${questions.length} questions for semantic duplicates...`);

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];

      try {
        // Generate embedding for the question
        const embedding = await this.generateQuestionEmbedding(question);

        if (embedding) {
          // Check for duplicates
          const duplicates = await this.findSemanticDuplicates(question, existingQuestions);

          if (duplicates.length > 0) {
            console.log(`⚠️  Semantic duplicate found (${duplicates[0].similarity.toFixed(3)}): "${question.title}"`);
            console.log(`   Similar to: "${duplicates[0].question.title}"`);

            results.duplicates.push({
              question,
              duplicates
            });
          } else {
            // Add embedding to question and mark as processed
            const processedQuestion = {
              ...question,
              embedding: embedding,
              embeddingVersion: this.embeddingModel,
              embeddingGeneratedAt: new Date().toISOString()
            };

            results.processed.push(processedQuestion);

            // Add to existing questions for subsequent checks in this batch
            existingQuestions.push(processedQuestion);
          }
        } else {
          console.log(`⚠️  Could not generate embedding for question: "${question.title}"`);
          results.errors.push({
            question,
            error: 'Failed to generate embedding'
          });
        }

        // Progress indicator
        if ((i + 1) % 10 === 0) {
          console.log(`📊 Processed ${i + 1}/${questions.length} questions`);
        }

      } catch (error) {
        console.error(`❌ Error processing question "${question.title}":`, error.message);
        results.errors.push({
          question,
          error: error.message
        });
      }
    }

    console.log(`✅ Batch processing complete: ${results.processed.length} unique, ${results.duplicates.length} duplicates, ${results.errors.length} errors`);

    return results;
  }

  /**
   * Generate cache key for content
   * @param {string} content - Content to hash
   * @returns {string} - MD5 hash of content
   */
  getCacheKey(content) {
    return crypto.createHash('md5').update(content, 'utf8').digest('hex');
  }

  /**
   * Clear the embedding cache
   */
  clearCache() {
    this.embeddingCache.clear();
    console.log('🧹 Embedding cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getCacheStats() {
    return {
      size: this.embeddingCache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }
}

module.exports = SemanticDeduplicator;
