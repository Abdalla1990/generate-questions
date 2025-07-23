// redis-queue/queue-manager.js - Redis queue manager for tracking available question sets
const Redis = require('redis');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPath = path.join(__dirname, '../', '../', '.env.dev');
const fallbackEnvPath = path.join(__dirname, '../', '../', '.env');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else if (fs.existsSync(fallbackEnvPath)) {
  require('dotenv').config({ path: fallbackEnvPath });
}

class QueueManager {
  constructor() {
    this.redisConfig = {
      username: 'default',
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 0
      }
    };

    this.client = null;
    this.isConnected = false;
  }


  /**
   * Connect to Redis
   */
  async connect() {
    try {
      console.log(`🔧 Redis Config: ${JSON.stringify(this.redisConfig)}`, { exists: fs.existsSync(envPath) });
      this.client = Redis.createClient(this.redisConfig);

      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('⚠️  Disconnected from Redis');
        this.isConnected = false;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      console.error('❌ Error connecting to Redis:', error);
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      console.log('👋 Disconnected from Redis');
    }
  }

  /**
   * Generate Redis key for category queue
   * @param {string} categoryId - The category ID
   * @returns {string} - Redis key for the category queue
   */
  getCategoryQueueKey(categoryId) {
    return `question_sets: queue:${categoryId} `;
  }

  /**
   * Generate Redis key for category metadata
   * @param {string} categoryId - The category ID
   * @returns {string} - Redis key for the category metadata
   */
  getCategoryMetaKey(categoryId) {
    return `question_sets: meta:${categoryId} `;
  }

  /**
   * Add question sets to the queue for a category
   * @param {string} categoryId - The category ID
   * @param {Array} setIds - Array of set IDs to add to the queue
   * @returns {Promise<number>} - Number of sets added to the queue
   */
  async addSetsToQueue(categoryId, setIds) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const queueKey = this.getCategoryQueueKey(categoryId);
    const metaKey = this.getCategoryMetaKey(categoryId);

    try {
      // Add set IDs to the queue (FIFO - First In, First Out)
      const result = await this.client.lPush(queueKey, setIds);

      // Update metadata: total sets available and last updated
      await this.client.hSet(metaKey, {
        total_available: await this.client.lLen(queueKey),
        last_updated: new Date().toISOString(),
        last_batch_size: setIds.length
      });

      console.log(`✅ Added ${setIds.length} sets to queue for category ${categoryId}`);
      return result;
    } catch (error) {
      console.error(`❌ Error adding sets to queue for category ${categoryId}: `, error);
      throw error;
    }
  }

  /**
   * Get the next available set ID from the queue for a category
   * @param {string} categoryId - The category ID
   * @returns {Promise<string|null>} - The next set ID or null if queue is empty
   */
  async getNextSetFromQueue(categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const queueKey = this.getCategoryQueueKey(categoryId);
    const metaKey = this.getCategoryMetaKey(categoryId);

    try {
      // Get the next set ID from the queue (FIFO)
      const setId = await this.client.rPop(queueKey);

      if (setId) {
        // Update metadata: decrease total available
        const remainingCount = await this.client.lLen(queueKey);
        await this.client.hSet(metaKey, 'total_available', remainingCount);

        console.log(`📤 Retrieved set ${setId} from queue for category ${categoryId}.${remainingCount} sets remaining.`);
      }

      return setId;
    } catch (error) {
      console.error(`❌ Error getting next set from queue for category ${categoryId}: `, error);
      throw error;
    }
  }

  /**
   * Get queue status for a category
   * @param {string} categoryId - The category ID
   * @returns {Promise<Object>} - Queue status information
   */
  async getQueueStatus(categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const queueKey = this.getCategoryQueueKey(categoryId);
    const metaKey = this.getCategoryMetaKey(categoryId);

    try {
      const [queueLength, metadata] = await Promise.all([
        this.client.lLen(queueKey),
        this.client.hGetAll(metaKey)
      ]);

      return {
        categoryId,
        available_sets: queueLength,
        metadata: metadata || {},
        queue_key: queueKey,
        meta_key: metaKey
      };
    } catch (error) {
      console.error(`❌ Error getting queue status for category ${categoryId}: `, error);
      throw error;
    }
  }

  /**
   * Get queue status for all categories
   * @returns {Promise<Array>} - Array of queue status for all categories
   */
  async getAllQueueStatuses() {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      // Find all category queue keys
      const queueKeys = await this.client.keys('question_sets:queue:*');
      const categoryIds = queueKeys.map(key => key.replace('question_sets:queue:', ''));

      const statuses = await Promise.all(
        categoryIds.map(categoryId => this.getQueueStatus(categoryId))
      );

      return statuses;
    } catch (error) {
      console.error('❌ Error getting all queue statuses:', error);
      throw error;
    }
  }

  /**
   * Clear the queue for a category
   * @param {string} categoryId - The category ID
   * @returns {Promise<boolean>} - Success status
   */
  async clearQueue(categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const queueKey = this.getCategoryQueueKey(categoryId);
    const metaKey = this.getCategoryMetaKey(categoryId);

    try {
      await Promise.all([
        this.client.del(queueKey),
        this.client.del(metaKey)
      ]);

      console.log(`🧹 Cleared queue for category ${categoryId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error clearing queue for category ${categoryId}: `, error);
      throw error;
    }
  }

  /**
   * Check if Redis is connected and healthy
   * @returns {Promise<boolean>} - Health status
   */
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.ping();
      return true;
    } catch (error) {
      console.error('❌ Redis health check failed:', error);
      return false;
    }
  }
}

module.exports = QueueManager;
