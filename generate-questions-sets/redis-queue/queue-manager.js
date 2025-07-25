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
  constructor({ redisConfig } = {}) {
    this.redisConfig = redisConfig ? Object.keys(redisConfig).length : {
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

        console.log(`📤 Retrieved set ${setId} from queue for category ${categoryId}. ${remainingCount} sets remaining.`);
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

  /**
   * Generate Redis key for user allocations
   * @param {string} userId - The user ID
   * @returns {string} - Redis key for the user allocations
   */
  getUserAllocationsKey(userId) {
    return `user_allocations:${userId}`;
  }

  /**
   * Generate Redis key for user allocation metadata
   * @param {string} userId - The user ID
   * @returns {string} - Redis key for the user allocation metadata
   */
  getUserMetaKey(userId) {
    return `user_allocations:meta:${userId}`;
  }

  /**
   * Get user's allocated sets for a specific category
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @returns {Promise<Array>} - Array of allocated set IDs for the category
   */
  async getUserCategoryAllocations(userId, categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);

    try {
      const allocations = await this.client.hGet(userKey, categoryId);
      return allocations ? JSON.parse(allocations) : [];
    } catch (error) {
      console.error(`❌ Error getting user category allocations for ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Add a set allocation to a user's category
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @param {string} setId - The set ID to allocate
   * @returns {Promise<void>}
   */
  async addUserCategoryAllocation(userId, categoryId, setId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);
    const metaKey = this.getUserMetaKey(userId);

    try {
      // Get current allocations for this category
      const currentAllocations = await this.getUserCategoryAllocations(userId, categoryId);

      // Add new set ID if not already allocated
      if (!currentAllocations.includes(setId)) {
        currentAllocations.push(setId);

        // Update the user's allocations
        await this.client.hSet(userKey, categoryId, JSON.stringify(currentAllocations));

        // Update metadata
        await this.client.hSet(metaKey, {
          last_updated: new Date().toISOString(),
          [`${categoryId}_count`]: currentAllocations.length.toString(),
          [`${categoryId}_last_allocated`]: setId
        });

        console.log(`✅ Allocated set ${setId} to user ${userId} for category ${categoryId}`);
      } else {
        console.log(`ℹ️  Set ${setId} already allocated to user ${userId} for category ${categoryId}`);
      }
    } catch (error) {
      console.error(`❌ Error adding user category allocation for ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get all allocations for a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Object with categoryId as keys and set ID arrays as values
   */
  async getUserAllocations(userId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);

    try {
      const allocations = await this.client.hGetAll(userKey);
      const parsedAllocations = {};

      for (const [categoryId, setIdsJson] of Object.entries(allocations)) {
        parsedAllocations[categoryId] = JSON.parse(setIdsJson);
      }

      return parsedAllocations;
    } catch (error) {
      console.error(`❌ Error getting user allocations for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get the next available set for a category that hasn't been allocated to the user
   * This method now includes automatic cache eviction
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @returns {Promise<string|null>} - The next available set ID or null if none available
   */
  async getNextAvailableSetForUser(userId, categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      // Apply cache eviction before allocation
      const evictionResults = await this.applyCacheEvictionWithTimestamps(userId, categoryId);

      if (evictionResults.removedCount > 0) {
        console.log(`🧹 Cache eviction: Removed ${evictionResults.removedCount} sets (${evictionResults.reason.join(', ')})`);
      }

      const queueKey = this.getCategoryQueueKey(categoryId);

      // Get user's current allocations for this category (after eviction)
      const userAllocations = await this.getUserCategoryAllocations(userId, categoryId);

      // Get all available sets for this category
      const availableSets = await this.client.lRange(queueKey, 0, -1);

      // Find the first set that hasn't been allocated to this user
      const nextSet = availableSets.find(setId => !userAllocations.includes(setId));

      if (nextSet) {
        // Allocate this set to the user with timestamp (but don't remove from global queue)
        await this.addUserCategoryAllocationWithTimestamp(userId, categoryId, nextSet);
        // Note: addUserCategoryAllocationWithTimestamp already logs the allocation
        return nextSet;
      } else {
        console.log(`⚠️  No new sets available for user ${userId} in category ${categoryId}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error getting next available set for user ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get allocation statistics for a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - User allocation statistics
   */
  async getUserAllocationStats(userId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const allocations = await this.getUserAllocations(userId);
      const metaKey = this.getUserMetaKey(userId);
      const metadata = await this.client.hGetAll(metaKey);

      const stats = {
        userId,
        totalAllocations: 0,
        categoriesCount: Object.keys(allocations).length,
        categories: {},
        lastUpdated: metadata.last_updated || null
      };

      for (const [categoryId, setIds] of Object.entries(allocations)) {
        stats.categories[categoryId] = {
          count: setIds.length,
          lastAllocated: metadata[`${categoryId}_last_allocated`] || null,
          setIds: setIds
        };
        stats.totalAllocations += setIds.length;
      }

      return stats;
    } catch (error) {
      console.error(`❌ Error getting user allocation stats for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all allocations for a user
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} - Success status
   */
  async clearUserAllocations(userId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);
    const metaKey = this.getUserMetaKey(userId);

    try {
      await Promise.all([
        this.client.del(userKey),
        this.client.del(metaKey)
      ]);

      console.log(`🧹 Cleared all allocations for user ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error clearing user allocations for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all users with allocations
   * @returns {Promise<Array>} - Array of user IDs with allocations
   */
  async getAllUsersWithAllocations() {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const userKeys = await this.client.keys('user_allocations:*');
      const userIds = userKeys
        .filter(key => !key.includes(':meta:'))
        .map(key => key.replace('user_allocations:', ''));

      return userIds;
    } catch (error) {
      console.error('❌ Error getting all users with allocations:', error);
      throw error;
    }
  }

  /**
   * Cache eviction policy configuration
   */
  static CACHE_CONFIG = {
    MAX_SETS_PER_CATEGORY: 10,
    MAX_AGE_MONTHS: 2
  };

  /**
   * Apply cache eviction policy for a user's category
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @returns {Promise<Object>} - Eviction results
   */
  async applyCacheEviction(userId, categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);
    const metaKey = this.getUserMetaKey(userId);
    const evictionResults = {
      removedCount: 0,
      removedSets: [],
      reason: []
    };

    try {
      // Get current allocations for this category
      const currentAllocations = await this.getUserCategoryAllocations(userId, categoryId);

      if (currentAllocations.length === 0) {
        return evictionResults;
      }

      // Get metadata to check timestamps
      const metadata = await this.client.hGetAll(metaKey);
      let setsToRemove = [];

      // Rule 1: Remove excess sets if more than MAX_SETS_PER_CATEGORY
      if (currentAllocations.length > QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY) {
        const excessCount = currentAllocations.length - QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY;
        const excessSets = currentAllocations.slice(0, excessCount); // Remove oldest (first allocated)

        setsToRemove.push(...excessSets);
        evictionResults.reason.push(`Exceeded maximum ${QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY} sets per category`);

        console.log(`🧹 Cache eviction: Removing ${excessCount} excess sets for user ${userId}, category ${categoryId}`);
      }

      // Rule 2: Remove sets older than MAX_AGE_MONTHS
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS);

      // Check if we have allocation timestamps stored (we'll need to enhance this)
      // For now, we'll use a simple approach based on the category's last_updated
      const lastUpdated = metadata[`${categoryId}_last_updated`];
      if (lastUpdated) {
        const lastUpdateDate = new Date(lastUpdated);
        if (lastUpdateDate < twoMonthsAgo) {
          // If the entire category hasn't been updated in 2 months, consider all sets old
          // In a more sophisticated implementation, we'd store individual timestamps per set
          const oldSets = currentAllocations.filter(setId => !setsToRemove.includes(setId));
          if (oldSets.length > 0) {
            setsToRemove.push(...oldSets);
            evictionResults.reason.push(`Sets older than ${QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS} months`);

            console.log(`🧹 Cache eviction: Removing ${oldSets.length} old sets for user ${userId}, category ${categoryId}`);
          }
        }
      }

      // Apply removals if any
      if (setsToRemove.length > 0) {
        const remainingSets = currentAllocations.filter(setId => !setsToRemove.includes(setId));

        // Update the user's allocations
        if (remainingSets.length > 0) {
          await this.client.hSet(userKey, categoryId, JSON.stringify(remainingSets));
        } else {
          // Remove the category entirely if no sets remain
          await this.client.hDel(userKey, categoryId);
        }

        // Update metadata
        await this.client.hSet(metaKey, {
          [`${categoryId}_count`]: remainingSets.length.toString(),
          [`${categoryId}_evicted_at`]: new Date().toISOString(),
          [`${categoryId}_evicted_count`]: (parseInt(metadata[`${categoryId}_evicted_count`] || '0') + setsToRemove.length).toString()
        });

        evictionResults.removedCount = setsToRemove.length;
        evictionResults.removedSets = setsToRemove;

        console.log(`✅ Cache eviction completed: Removed ${setsToRemove.length} sets for user ${userId}, category ${categoryId}`);
        console.log(`📊 Remaining sets: ${remainingSets.length}`);
      }

      return evictionResults;
    } catch (error) {
      console.error(`❌ Error applying cache eviction for ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced method to get next available set with automatic cache eviction
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @returns {Promise<Object>} - Result with set ID and eviction info
   */
  async getNextAvailableSetForUserWithEviction(userId, categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      // Apply cache eviction before allocation
      const evictionResults = await this.applyCacheEviction(userId, categoryId);

      // Get the next available set using existing method
      const setId = await this.getNextAvailableSetForUser(userId, categoryId);

      return {
        setId,
        eviction: evictionResults
      };
    } catch (error) {
      console.error(`❌ Error getting next available set with eviction for ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced allocation method that stores individual set timestamps for better age tracking
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @param {string} setId - The set ID to allocate
   * @returns {Promise<void>}
   */
  async addUserCategoryAllocationWithTimestamp(userId, categoryId, setId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);
    const metaKey = this.getUserMetaKey(userId);
    const timestampKey = `${this.getUserAllocationsKey(userId)}:timestamps`;

    try {
      // Get current allocations for this category
      const currentAllocations = await this.getUserCategoryAllocations(userId, categoryId);

      // Add new set ID if not already allocated
      if (!currentAllocations.includes(setId)) {
        currentAllocations.push(setId);

        // Update the user's allocations
        await this.client.hSet(userKey, categoryId, JSON.stringify(currentAllocations));

        // Store timestamp for this specific set
        await this.client.hSet(timestampKey, `${categoryId}:${setId}`, new Date().toISOString());

        // Update metadata
        await this.client.hSet(metaKey, {
          last_updated: new Date().toISOString(),
          [`${categoryId}_count`]: currentAllocations.length.toString(),
          [`${categoryId}_last_allocated`]: setId,
          [`${categoryId}_last_updated`]: new Date().toISOString()
        });

        console.log(`✅ Allocated set ${setId} to user ${userId} for category ${categoryId} with timestamp`);
      } else {
        console.log(`ℹ️  Set ${setId} already allocated to user ${userId} for category ${categoryId}`);
      }
    } catch (error) {
      console.error(`❌ Error adding user category allocation with timestamp for ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced cache eviction with individual set timestamp checking
   * @param {string} userId - The user ID
   * @param {string} categoryId - The category ID
   * @returns {Promise<Object>} - Eviction results
   */
  async applyCacheEvictionWithTimestamps(userId, categoryId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    const userKey = this.getUserAllocationsKey(userId);
    const metaKey = this.getUserMetaKey(userId);
    const timestampKey = `${this.getUserAllocationsKey(userId)}:timestamps`;
    const evictionResults = {
      removedCount: 0,
      removedSets: [],
      reason: []
    };

    try {
      // Get current allocations for this category
      const currentAllocations = await this.getUserCategoryAllocations(userId, categoryId);

      if (currentAllocations.length === 0) {
        return evictionResults;
      }

      let setsToRemove = [];
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS);

      // Rule 1: Remove excess sets if more than MAX_SETS_PER_CATEGORY
      if (currentAllocations.length > QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY) {
        const excessCount = currentAllocations.length - QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY;
        const excessSets = currentAllocations.slice(0, excessCount);

        setsToRemove.push(...excessSets);
        evictionResults.reason.push(`Exceeded maximum ${QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY} sets per category`);
      }

      // Rule 2: Remove sets older than MAX_AGE_MONTHS using individual timestamps
      const timestamps = await this.client.hGetAll(timestampKey);

      for (const setId of currentAllocations) {
        if (setsToRemove.includes(setId)) continue; // Already marked for removal

        const timestampKey_field = `${categoryId}:${setId}`;
        const timestamp = timestamps[timestampKey_field];

        if (timestamp) {
          const allocationDate = new Date(timestamp);
          if (allocationDate < twoMonthsAgo) {
            setsToRemove.push(setId);
            if (!evictionResults.reason.includes(`Sets older than ${QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS} months`)) {
              evictionResults.reason.push(`Sets older than ${QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS} months`);
            }
          }
        }
      }

      // Apply removals if any
      if (setsToRemove.length > 0) {
        const remainingSets = currentAllocations.filter(setId => !setsToRemove.includes(setId));

        // Update the user's allocations
        if (remainingSets.length > 0) {
          await this.client.hSet(userKey, categoryId, JSON.stringify(remainingSets));
        } else {
          await this.client.hDel(userKey, categoryId);
        }

        // Remove timestamps for evicted sets
        const timestampKeysToRemove = setsToRemove.map(setId => `${categoryId}:${setId}`);
        if (timestampKeysToRemove.length > 0) {
          await this.client.hDel(timestampKey, ...timestampKeysToRemove);
        }

        // Update metadata
        await this.client.hSet(metaKey, {
          [`${categoryId}_count`]: remainingSets.length.toString(),
          [`${categoryId}_evicted_at`]: new Date().toISOString(),
          [`${categoryId}_evicted_count`]: (parseInt(await this.client.hGet(metaKey, `${categoryId}_evicted_count`) || '0') + setsToRemove.length).toString()
        });

        evictionResults.removedCount = setsToRemove.length;
        evictionResults.removedSets = setsToRemove;

        console.log(`✅ Enhanced cache eviction completed: Removed ${setsToRemove.length} sets for user ${userId}, category ${categoryId}`);
        console.log(`📊 Remaining sets: ${remainingSets.length}`);
        console.log(`🗑️  Evicted sets: ${setsToRemove.join(', ')}`);
      }

      return evictionResults;
    } catch (error) {
      console.error(`❌ Error applying enhanced cache eviction for ${userId}/${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get cache statistics for a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Cache statistics
   */
  async getUserCacheStats(userId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const allocations = await this.getUserAllocations(userId);
      const metaKey = this.getUserMetaKey(userId);
      const metadata = await this.client.hGetAll(metaKey);
      const timestampKey = `${this.getUserAllocationsKey(userId)}:timestamps`;
      const timestamps = await this.client.hGetAll(timestampKey);

      const cacheStats = {
        userId,
        totalAllocations: 0,
        categoriesCount: Object.keys(allocations).length,
        categories: {},
        evictionStats: {
          totalEvicted: 0,
          lastEvictionDate: null
        },
        cacheHealth: {
          categoriesNearLimit: 0,
          categoriesOverAge: 0
        }
      };

      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS);

      for (const [categoryId, setIds] of Object.entries(allocations)) {
        const categoryStats = {
          count: setIds.length,
          nearLimit: setIds.length >= QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY * 0.8,
          overLimit: setIds.length > QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY,
          oldestSetAge: null,
          newestSetAge: null,
          hasOldSets: false,
          evictedCount: parseInt(metadata[`${categoryId}_evicted_count`] || '0'),
          lastEvicted: metadata[`${categoryId}_evicted_at`] || null
        };

        // Analyze timestamps for this category
        const categoryTimestamps = [];
        for (const setId of setIds) {
          const timestampKey_field = `${categoryId}:${setId}`;
          const timestamp = timestamps[timestampKey_field];
          if (timestamp) {
            const date = new Date(timestamp);
            categoryTimestamps.push(date);

            if (date < twoMonthsAgo) {
              categoryStats.hasOldSets = true;
            }
          }
        }

        if (categoryTimestamps.length > 0) {
          categoryTimestamps.sort((a, b) => a - b);
          categoryStats.oldestSetAge = categoryTimestamps[0];
          categoryStats.newestSetAge = categoryTimestamps[categoryTimestamps.length - 1];
        }

        cacheStats.categories[categoryId] = categoryStats;
        cacheStats.totalAllocations += setIds.length;
        cacheStats.evictionStats.totalEvicted += categoryStats.evictedCount;

        if (categoryStats.nearLimit) cacheStats.cacheHealth.categoriesNearLimit++;
        if (categoryStats.hasOldSets) cacheStats.cacheHealth.categoriesOverAge++;
      }

      // Find most recent eviction date
      const evictionDates = Object.values(cacheStats.categories)
        .map(cat => cat.lastEvicted)
        .filter(date => date)
        .sort()
        .reverse();

      if (evictionDates.length > 0) {
        cacheStats.evictionStats.lastEvictionDate = evictionDates[0];
      }

      return cacheStats;
    } catch (error) {
      console.error(`❌ Error getting cache stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Manually trigger cache eviction for a user across all categories
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Eviction summary
   */
  async triggerCacheEvictionForUser(userId) {
    if (!this.isConnected) {
      throw new Error('Redis client is not connected');
    }

    try {
      const allocations = await this.getUserAllocations(userId);
      const evictionSummary = {
        userId,
        categoriesProcessed: 0,
        totalRemoved: 0,
        categoryResults: {}
      };

      for (const categoryId of Object.keys(allocations)) {
        const result = await this.applyCacheEvictionWithTimestamps(userId, categoryId);
        evictionSummary.categoryResults[categoryId] = result;
        evictionSummary.totalRemoved += result.removedCount;
        evictionSummary.categoriesProcessed++;
      }

      console.log(`🧹 Manual cache eviction for user ${userId}: ${evictionSummary.totalRemoved} sets removed across ${evictionSummary.categoriesProcessed} categories`);
      return evictionSummary;
    } catch (error) {
      console.error(`❌ Error triggering cache eviction for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update cache configuration
   * @param {Object} config - New cache configuration
   * @param {number} config.maxSetsPerCategory - Maximum sets per category
   * @param {number} config.maxAgeMonths - Maximum age in months
   */
  static updateCacheConfig(config) {
    if (config.maxSetsPerCategory !== undefined) {
      QueueManager.CACHE_CONFIG.MAX_SETS_PER_CATEGORY = config.maxSetsPerCategory;
    }
    if (config.maxAgeMonths !== undefined) {
      QueueManager.CACHE_CONFIG.MAX_AGE_MONTHS = config.maxAgeMonths;
    }
    console.log(`📝 Cache configuration updated:`, QueueManager.CACHE_CONFIG);
  }

  /**
   * Get current cache configuration
   * @returns {Object} - Current cache configuration
   */
  static getCacheConfig() {
    return { ...QueueManager.CACHE_CONFIG };
  }
}

module.exports = QueueManager;
