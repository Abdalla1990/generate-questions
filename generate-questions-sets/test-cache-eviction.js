// test-cache-eviction.js - Test script for cache eviction policy
const SetsAllocator = require('./sets-allocator');
const QueueManager = require('./redis-queue/queue-manager');

class CacheEvictionTester {
  constructor() {
    this.allocator = new SetsAllocator();
  }

  /**
   * Test the cache eviction policy
   */
  async runTests() {
    console.log('🧪 Starting Cache Eviction Policy Tests\n');

    try {
      await this.allocator.initialize();

      // Test 1: Test max sets per category eviction
      await this.testMaxSetsEviction();

      // Test 2: Test age-based eviction (simulated)
      await this.testAgeBasedEviction();

      // Test 3: Test cache statistics
      await this.testCacheStatistics();

      // Test 4: Test manual eviction
      await this.testManualEviction();

      console.log('\n✅ All cache eviction tests completed successfully!');

    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Test 1: Test that excess sets are evicted when exceeding MAX_SETS_PER_CATEGORY
   */
  async testMaxSetsEviction() {
    console.log('📋 Test 1: Testing max sets per category eviction...');

    const testUserId = 'test-user-max-sets';
    const testCategory = 'test-category-max';

    try {
      // Clear any existing data for this test user
      await this.allocator.queueManager.clearUserAllocations(testUserId);

      // Get the current max sets limit
      const config = QueueManager.getCacheConfig();
      const maxSets = config.MAX_SETS_PER_CATEGORY;

      console.log(`   Max sets per category: ${maxSets}`);

      // Add sets up to the limit + 3 (should trigger eviction)
      const setsToAdd = maxSets + 3;
      const mockSetIds = Array.from({ length: setsToAdd }, (_, i) => `set-${i + 1}`);

      // Manually add sets to simulate allocations over time
      for (let i = 0; i < setsToAdd; i++) {
        await this.allocator.queueManager.addUserAllocation(testUserId, testCategory, mockSetIds[i]);
        // Add a small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Check allocations before eviction
      const beforeEviction = await this.allocator.queueManager.getUserCategoryAllocations(testUserId, testCategory);
      console.log(`   Sets before eviction: ${beforeEviction.length}`);

      // Trigger eviction
      const evictionResult = await this.allocator.queueManager.applyCacheEvictionWithTimestamps(testUserId, testCategory);

      // Check allocations after eviction
      const afterEviction = await this.allocator.queueManager.getUserCategoryAllocations(testUserId, testCategory);
      console.log(`   Sets after eviction: ${afterEviction.length}`);
      console.log(`   Sets removed: ${evictionResult.removedCount}`);
      console.log(`   Eviction reason: ${evictionResult.reason.join(', ')}`);

      // Verify eviction worked correctly
      if (afterEviction.length === maxSets && evictionResult.removedCount === 3) {
        console.log('   ✅ Max sets eviction test PASSED');
      } else {
        console.log('   ❌ Max sets eviction test FAILED');
        console.log(`   Expected ${maxSets} sets remaining, got ${afterEviction.length}`);
        console.log(`   Expected 3 sets removed, got ${evictionResult.removedCount}`);
      }

    } catch (error) {
      console.log('   ❌ Max sets eviction test ERROR:', error.message);
    }
  }

  /**
   * Test 2: Test age-based eviction (simulated with manual timestamps)
   */
  async testAgeBasedEviction() {
    console.log('\n📅 Test 2: Testing age-based eviction...');

    const testUserId = 'test-user-age';
    const testCategory = 'test-category-age';

    try {
      // Clear any existing data for this test user
      await this.allocator.queueManager.clearUserAllocations(testUserId);

      // Add some sets with simulated old timestamps
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 3); // 3 months ago (older than 2 month limit)

      const recentDate = new Date();
      recentDate.setDays = recentDate.getDate() - 7; // 1 week ago

      // Add sets manually with specific timestamps
      const oldSets = ['old-set-1', 'old-set-2'];
      const recentSets = ['recent-set-1', 'recent-set-2'];

      // Add old sets
      for (const setId of oldSets) {
        await this.allocator.queueManager.addUserAllocation(testUserId, testCategory, setId);
        // Manually set old timestamp
        const timestampKey = `${this.allocator.queueManager.getUserAllocationsKey(testUserId)}:timestamps`;
        await this.allocator.queueManager.client.hSet(timestampKey, `${testCategory}:${setId}`, oldDate.toISOString());
      }

      // Add recent sets
      for (const setId of recentSets) {
        await this.allocator.queueManager.addUserAllocation(testUserId, testCategory, setId);
        // Recent sets will have current timestamps automatically
      }

      // Check allocations before eviction
      const beforeEviction = await this.allocator.queueManager.getUserCategoryAllocations(testUserId, testCategory);
      console.log(`   Sets before eviction: ${beforeEviction.length}`);

      // Trigger eviction
      const evictionResult = await this.allocator.queueManager.applyCacheEvictionWithTimestamps(testUserId, testCategory);

      // Check allocations after eviction
      const afterEviction = await this.allocator.queueManager.getUserCategoryAllocations(testUserId, testCategory);
      console.log(`   Sets after eviction: ${afterEviction.length}`);
      console.log(`   Sets removed: ${evictionResult.removedCount}`);
      console.log(`   Eviction reason: ${evictionResult.reason.join(', ')}`);
      console.log(`   Removed sets: ${evictionResult.removedSets.join(', ')}`);

      // Verify eviction worked correctly (should remove 2 old sets)
      if (afterEviction.length === 2 && evictionResult.removedCount === 2) {
        console.log('   ✅ Age-based eviction test PASSED');
      } else {
        console.log('   ❌ Age-based eviction test FAILED');
        console.log(`   Expected 2 sets remaining, got ${afterEviction.length}`);
        console.log(`   Expected 2 sets removed, got ${evictionResult.removedCount}`);
      }

    } catch (error) {
      console.log('   ❌ Age-based eviction test ERROR:', error.message);
    }
  }

  /**
   * Test 3: Test cache statistics functionality
   */
  async testCacheStatistics() {
    console.log('\n📊 Test 3: Testing cache statistics...');

    const testUserId = 'test-user-stats';

    try {
      // Clear any existing data for this test user
      await this.allocator.queueManager.clearUserAllocations(testUserId);

      // Add some test data
      const categories = ['cat1', 'cat2', 'cat3'];
      for (const category of categories) {
        for (let i = 1; i <= 5; i++) {
          await this.allocator.queueManager.addUserAllocation(testUserId, category, `${category}-set-${i}`);
        }
      }

      // Get cache statistics
      const stats = await this.allocator.queueManager.getUserCacheStats(testUserId);

      console.log(`   Total allocations: ${stats.totalAllocations}`);
      console.log(`   Categories count: ${stats.categoriesCount}`);
      console.log(`   Categories near limit: ${stats.cacheHealth.categoriesNearLimit}`);
      console.log(`   Categories over age: ${stats.cacheHealth.categoriesOverAge}`);

      // Verify statistics
      if (stats.totalAllocations === 15 && stats.categoriesCount === 3) {
        console.log('   ✅ Cache statistics test PASSED');
      } else {
        console.log('   ❌ Cache statistics test FAILED');
        console.log(`   Expected 15 total allocations, got ${stats.totalAllocations}`);
        console.log(`   Expected 3 categories, got ${stats.categoriesCount}`);
      }

    } catch (error) {
      console.log('   ❌ Cache statistics test ERROR:', error.message);
    }
  }

  /**
   * Test 4: Test manual eviction trigger
   */
  async testManualEviction() {
    console.log('\n🧹 Test 4: Testing manual eviction trigger...');

    const testUserId = 'test-user-manual';

    try {
      // Clear any existing data for this test user
      await this.allocator.queueManager.clearUserAllocations(testUserId);

      // Add test data that should trigger eviction
      const config = QueueManager.getCacheConfig();
      const maxSets = config.MAX_SETS_PER_CATEGORY;

      // Add more than max sets to trigger eviction
      for (let i = 1; i <= maxSets + 2; i++) {
        await this.allocator.queueManager.addUserAllocation(testUserId, 'manual-test-cat', `manual-set-${i}`);
      }

      // Trigger manual eviction for the user
      const summary = await this.allocator.queueManager.triggerCacheEvictionForUser(testUserId);

      console.log(`   Categories processed: ${summary.categoriesProcessed}`);
      console.log(`   Total sets removed: ${summary.totalRemoved}`);

      // Verify manual eviction worked
      if (summary.categoriesProcessed === 1 && summary.totalRemoved === 2) {
        console.log('   ✅ Manual eviction test PASSED');
      } else {
        console.log('   ❌ Manual eviction test FAILED');
        console.log(`   Expected 1 category processed, got ${summary.categoriesProcessed}`);
        console.log(`   Expected 2 sets removed, got ${summary.totalRemoved}`);
      }

    } catch (error) {
      console.log('   ❌ Manual eviction test ERROR:', error.message);
    }
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    console.log('\n🧽 Cleaning up test data...');

    const testUsers = ['test-user-max-sets', 'test-user-age', 'test-user-stats', 'test-user-manual'];

    for (const userId of testUsers) {
      try {
        await this.allocator.queueManager.clearUserAllocations(userId);
        console.log(`   Cleaned up data for ${userId}`);
      } catch (error) {
        console.log(`   Error cleaning up ${userId}:`, error.message);
      }
    }

    // Close Redis connection
    if (this.allocator.queueManager.isConnected) {
      await this.allocator.queueManager.disconnect();
    }

    console.log('   ✅ Cleanup completed');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new CacheEvictionTester();
  tester.runTests().catch(error => {
    console.error('❌ Test runner error:', error);
    process.exit(1);
  });
}

module.exports = CacheEvictionTester;
