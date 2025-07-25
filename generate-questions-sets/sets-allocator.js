// sets-allocator.js - Manages question set allocations per user
const QueueManager = require('./redis-queue/queue-manager');

class SetsAllocator {
  constructor() {
    this.queueManager = new QueueManager();
    this.isInitialized = false;
  }

  /**
   * Initialize the allocator
   */
  async initialize() {
    if (this.isInitialized) {
      return true;
    }

    const connected = await this.queueManager.connect();
    if (!connected) {
      throw new Error('Failed to connect to Redis for set allocation');
    }

    this.isInitialized = true;
    console.log('✅ Sets allocator initialized');
    return true;
  }

  /**
   * Allocate question sets for a user based on selected categories
   * @param {string} userId - The user ID
   * @param {Array<string>} categoryIds - Array of category IDs to allocate sets for
   * @returns {Promise<Object>} - Allocation results
   */
  async allocateSetsForUser(userId, categoryIds) {
    if (!this.isInitialized) {
      throw new Error('Allocator not initialized. Call initialize() first.');
    }

    const results = {
      userId,
      successful: {},
      failed: {},
      summary: {
        requested: categoryIds.length,
        successful: 0,
        failed: 0
      }
    };

    console.log(`🎯 Allocating sets for user ${userId} across ${categoryIds.length} categories`);

    for (const categoryId of categoryIds) {
      try {
        const setId = await this.queueManager.getNextAvailableSetForUser(userId, categoryId);

        if (setId) {
          results.successful[categoryId] = setId;
          results.summary.successful++;
          // Note: allocation already logged by QueueManager
        } else {
          results.failed[categoryId] = 'No available sets';
          results.summary.failed++;
          console.log(`❌ No available sets for category ${categoryId} for user ${userId}`);
        }
      } catch (error) {
        results.failed[categoryId] = error.message;
        results.summary.failed++;
        console.error(`❌ Error allocating set for category ${categoryId} to user ${userId}:`, error);
      }
    }

    console.log(`📊 Allocation complete for user ${userId}: ${results.summary.successful} successful, ${results.summary.failed} failed`);
    return results;
  }

  /**
   * Get a user's current allocations
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - User's current allocations
   */
  async getUserAllocations(userId) {
    if (!this.isInitialized) {
      throw new Error('Allocator not initialized. Call initialize() first.');
    }

    try {
      const allocations = await this.queueManager.getUserAllocations(userId);
      console.log(`📋 Retrieved allocations for user ${userId}: ${Object.keys(allocations).length} categories`);
      return allocations;
    } catch (error) {
      console.error(`❌ Error getting allocations for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed allocation statistics for a user
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Detailed allocation statistics
   */
  async getUserStats(userId) {
    if (!this.isInitialized) {
      throw new Error('Allocator not initialized. Call initialize() first.');
    }

    try {
      const stats = await this.queueManager.getUserAllocationStats(userId);
      console.log(`📊 Retrieved stats for user ${userId}: ${stats.totalAllocations} total allocations across ${stats.categoriesCount} categories`);
      return stats;
    } catch (error) {
      console.error(`❌ Error getting stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check availability for categories without allocating
   * @param {string} userId - The user ID
   * @param {Array<string>} categoryIds - Array of category IDs to check
   * @returns {Promise<Object>} - Availability status for each category
   */
  async checkAvailability(userId, categoryIds) {
    if (!this.isInitialized) {
      throw new Error('Allocator not initialized. Call initialize() first.');
    }

    const availability = {};

    console.log(`🔍 Checking availability for user ${userId} across ${categoryIds.length} categories`);

    for (const categoryId of categoryIds) {
      try {
        // Get user's current allocations for this category
        const userAllocations = await this.queueManager.getUserCategoryAllocations(userId, categoryId);

        // Get all available sets for this category
        const queueKey = this.queueManager.getCategoryQueueKey(categoryId);
        const availableSets = await this.queueManager.client.lRange(queueKey, 0, -1);

        // Count sets not yet allocated to this user
        const newSetsAvailable = availableSets.filter(setId => !userAllocations.includes(setId)).length;

        availability[categoryId] = {
          totalAvailable: availableSets.length,
          userAllocated: userAllocations.length,
          newAvailable: newSetsAvailable,
          hasNewSets: newSetsAvailable > 0
        };

        console.log(`📊 Category ${categoryId}: ${newSetsAvailable} new sets available for user ${userId}`);
      } catch (error) {
        availability[categoryId] = {
          error: error.message,
          hasNewSets: false
        };
        console.error(`❌ Error checking availability for category ${categoryId}:`, error);
      }
    }

    return availability;
  }

  /**
   * Get all users and their allocation summaries
   * @returns {Promise<Array>} - Array of user summaries
   */
  async getAllUsersSummary() {
    if (!this.isInitialized) {
      throw new Error('Allocator not initialized. Call initialize() first.');
    }

    try {
      const userIds = await this.queueManager.getAllUsersWithAllocations();
      const summaries = [];

      console.log(`📊 Generating summary for ${userIds.length} users`);

      for (const userId of userIds) {
        try {
          const stats = await this.queueManager.getUserAllocationStats(userId);
          summaries.push({
            userId,
            totalAllocations: stats.totalAllocations,
            categoriesCount: stats.categoriesCount,
            lastUpdated: stats.lastUpdated,
            categories: Object.keys(stats.categories)
          });
        } catch (error) {
          console.error(`❌ Error getting summary for user ${userId}:`, error);
          summaries.push({
            userId,
            error: error.message
          });
        }
      }

      return summaries;
    } catch (error) {
      console.error('❌ Error getting all users summary:', error);
      throw error;
    }
  }

  /**
   * Reset all allocations for a user (useful for testing or user reset)
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} - Success status
   */
  async resetUserAllocations(userId) {
    if (!this.isInitialized) {
      throw new Error('Allocator not initialized. Call initialize() first.');
    }

    try {
      const result = await this.queueManager.clearUserAllocations(userId);
      console.log(`🔄 Reset all allocations for user ${userId}`);
      return result;
    } catch (error) {
      console.error(`❌ Error resetting allocations for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Health check for the allocator
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const isHealthy = await this.queueManager.healthCheck();
      return {
        healthy: isHealthy,
        initialized: this.isInitialized,
        redisConnected: this.queueManager.isConnected
      };
    } catch (error) {
      console.error('❌ Allocator health check failed:', error);
      return {
        healthy: false,
        initialized: this.isInitialized,
        redisConnected: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    if (this.queueManager) {
      await this.queueManager.disconnect();
    }
    this.isInitialized = false;
    console.log('👋 Sets allocator cleaned up');
  }
}

module.exports = SetsAllocator;
