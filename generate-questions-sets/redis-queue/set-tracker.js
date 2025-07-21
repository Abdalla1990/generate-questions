// redis-queue/set-tracker.js - Tracks question sets and integrates with Redis queue
const QueueManager = require('./queue-manager');

class SetTracker {
  constructor() {
    this.queueManager = new QueueManager();
  }

  /**
   * Initialize the set tracker
   */
  async initialize() {
    const connected = await this.queueManager.connect();
    if (!connected) {
      throw new Error('Failed to connect to Redis');
    }
    return true;
  }

  /**
   * Process newly created sets and add them to the queue
   * @param {string} categoryId - The category ID
   * @param {Array} sets - Array of set objects with id property
   * @returns {Promise<Object>} - Processing result
   */
  async processNewSets(categoryId, sets) {
    try {
      if (!sets || sets.length === 0) {
        console.log(`ℹ️  No sets to process for category ${categoryId}`);
        return { processed: 0, categoryId };
      }

      // Extract set IDs
      const setIds = sets.map(set => set.id || set.setId);

      // Add sets to the Redis queue
      await this.queueManager.addSetsToQueue(categoryId, setIds);

      console.log(`📊 Processed ${setIds.length} new sets for category ${categoryId}`);

      return {
        processed: setIds.length,
        categoryId,
        setIds,
        status: 'success'
      };
    } catch (error) {
      console.error(`❌ Error processing new sets for category ${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get the next available set for a category
   * @param {string} categoryId - The category ID
   * @returns {Promise<string|null>} - The next set ID or null if none available
   */
  async getNextAvailableSet(categoryId) {
    try {
      const setId = await this.queueManager.getNextSetFromQueue(categoryId);

      if (setId) {
        console.log(`🎯 Retrieved set ${setId} for category ${categoryId}`);
      } else {
        console.log(`⚠️  No available sets for category ${categoryId}`);
      }

      return setId;
    } catch (error) {
      console.error(`❌ Error getting next available set for category ${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get availability status for a category
   * @param {string} categoryId - The category ID
   * @returns {Promise<Object>} - Availability status
   */
  async getCategoryAvailability(categoryId) {
    try {
      const status = await this.queueManager.getQueueStatus(categoryId);

      return {
        categoryId,
        available: status.available_sets > 0,
        count: status.available_sets,
        metadata: status.metadata
      };
    } catch (error) {
      console.error(`❌ Error getting category availability for ${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Get availability status for all categories
   * @returns {Promise<Array>} - Array of availability statuses
   */
  async getAllCategoriesAvailability() {
    try {
      const statuses = await this.queueManager.getAllQueueStatuses();

      return statuses.map(status => ({
        categoryId: status.categoryId,
        available: status.available_sets > 0,
        count: status.available_sets,
        metadata: status.metadata
      }));
    } catch (error) {
      console.error('❌ Error getting all categories availability:', error);
      throw error;
    }
  }

  /**
   * Get detailed queue information
   * @returns {Promise<Object>} - Detailed queue information
   */
  async getQueueInfo() {
    try {
      const statuses = await this.queueManager.getAllQueueStatuses();

      const totalSets = statuses.reduce((sum, status) => sum + status.available_sets, 0);
      const categoriesWithSets = statuses.filter(status => status.available_sets > 0).length;

      return {
        total_categories: statuses.length,
        categories_with_available_sets: categoriesWithSets,
        total_available_sets: totalSets,
        categories: statuses.map(status => ({
          categoryId: status.categoryId,
          available_sets: status.available_sets,
          last_updated: status.metadata.last_updated,
          last_batch_size: parseInt(status.metadata.last_batch_size) || 0
        }))
      };
    } catch (error) {
      console.error('❌ Error getting queue info:', error);
      throw error;
    }
  }

  /**
   * Clear all sets for a category
   * @param {string} categoryId - The category ID
   * @returns {Promise<boolean>} - Success status
   */
  async clearCategoryQueue(categoryId) {
    try {
      const result = await this.queueManager.clearQueue(categoryId);
      console.log(`🧹 Cleared queue for category ${categoryId}`);
      return result;
    } catch (error) {
      console.error(`❌ Error clearing queue for category ${categoryId}:`, error);
      throw error;
    }
  }

  /**
   * Health check for the set tracker
   * @returns {Promise<boolean>} - Health status
   */
  async healthCheck() {
    try {
      return await this.queueManager.healthCheck();
    } catch (error) {
      console.error('❌ Set tracker health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    await this.queueManager.disconnect();
  }
}

module.exports = SetTracker;
