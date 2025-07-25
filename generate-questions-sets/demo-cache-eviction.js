// demo-cache-eviction.js - Demonstration of cache eviction policy
const SetsAllocator = require('./sets-allocator');
const QueueManager = require('./redis-queue/queue-manager');

class CacheEvictionDemo {
  constructor() {
    this.allocator = new SetsAllocator();
  }

  /**
   * Run a complete demonstration of the cache eviction policy
   */
  async runDemo() {
    console.log('🎭 Cache Eviction Policy Demonstration\n');

    try {
      await this.allocator.initialize();

      const demoUserId = 'demo-user';
      const demoCategory = 'technology';

      console.log('📋 Current Cache Configuration:');
      const config = QueueManager.getCacheConfig();
      console.log(`   Max Sets Per Category: ${config.MAX_SETS_PER_CATEGORY}`);
      console.log(`   Max Age: ${config.MAX_AGE_MONTHS} months\n`);

      // Step 1: Clear any existing data
      console.log('🧽 Step 1: Clearing existing allocations...');
      await this.allocator.queueManager.clearUserAllocations(demoUserId);

      // Step 2: Show normal allocation (within limits)
      console.log('\n📈 Step 2: Allocating sets normally (within limits)...');
      for (let i = 1; i <= 8; i++) {
        const result = await this.allocator.allocateNext(demoUserId, demoCategory);
        if (result.success) {
          console.log(`   Allocated set: ${result.setId}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for demo
      }

      // Show current state
      await this.showUserState(demoUserId, 'After normal allocation');

      // Step 3: Exceed the limit to trigger eviction
      console.log('\n⚠️  Step 3: Allocating beyond limit (should trigger eviction)...');
      for (let i = 9; i <= 13; i++) {
        const result = await this.allocator.allocateNext(demoUserId, demoCategory);
        if (result.success) {
          console.log(`   Allocated set: ${result.setId}`);
          if (result.evictionPerformed) {
            console.log(`   🗑️  Eviction triggered: ${result.evictionSummary.removedCount} sets removed`);
            console.log(`   📝 Reason: ${result.evictionSummary.reason.join(', ')}`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Show state after eviction
      await this.showUserState(demoUserId, 'After limit exceeded (with eviction)');

      // Step 4: Demonstrate age-based eviction simulation
      console.log('\n🕰️  Step 4: Simulating age-based eviction...');
      await this.simulateAgeBasedEviction(demoUserId, demoCategory);

      // Step 5: Show cache statistics
      console.log('\n📊 Step 5: Cache Statistics Summary...');
      await this.showCacheStatistics(demoUserId);

      // Step 6: Manual eviction trigger
      console.log('\n🧹 Step 6: Manual eviction trigger...');
      const summary = await this.allocator.queueManager.triggerCacheEvictionForUser(demoUserId);
      console.log(`   Processed ${summary.categoriesProcessed} categories`);
      console.log(`   Removed ${summary.totalRemoved} total sets`);

      console.log('\n✅ Cache eviction demonstration completed!');
      console.log('\n💡 Key takeaways:');
      console.log('   • Sets are automatically evicted when user exceeds 10 sets per category');
      console.log('   • Oldest sets are removed first to make room for new allocations');
      console.log('   • Sets older than 2 months are automatically removed');
      console.log('   • Global queue remains intact - eviction only affects user allocations');
      console.log('   • Manual eviction can be triggered for maintenance');

    } catch (error) {
      console.error('❌ Demo failed:', error);
    } finally {
      // Cleanup
      try {
        await this.allocator.queueManager.clearUserAllocations('demo-user');
        if (this.allocator.queueManager.isConnected) {
          await this.allocator.queueManager.disconnect();
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  }

  /**
   * Show the current state of a user's allocations
   */
  async showUserState(userId, title) {
    console.log(`\n📋 ${title}:`);

    try {
      const allocations = await this.allocator.queueManager.getUserAllocations(userId);
      const stats = await this.allocator.queueManager.getUserAllocationStats(userId);

      console.log(`   Total allocations: ${stats.totalAllocations}`);
      console.log(`   Categories: ${stats.categoriesCount}`);

      for (const [categoryId, setIds] of Object.entries(allocations)) {
        console.log(`   ${categoryId}: ${setIds.length} sets [${setIds.slice(0, 3).join(', ')}${setIds.length > 3 ? '...' : ''}]`);
      }

    } catch (error) {
      console.log(`   Error getting user state: ${error.message}`);
    }
  }

  /**
   * Show detailed cache statistics
   */
  async showCacheStatistics(userId) {
    try {
      const stats = await this.allocator.queueManager.getUserCacheStats(userId);

      console.log(`   User: ${userId}`);
      console.log(`   Total Allocations: ${stats.totalAllocations}`);
      console.log(`   Categories: ${stats.categoriesCount}`);
      console.log(`   Total Evicted: ${stats.evictionStats.totalEvicted}`);
      console.log(`   Categories Near Limit: ${stats.cacheHealth.categoriesNearLimit}`);
      console.log(`   Categories With Old Sets: ${stats.cacheHealth.categoriesOverAge}`);

      if (Object.keys(stats.categories).length > 0) {
        console.log('   \n   Category Details:');
        for (const [categoryId, categoryStats] of Object.entries(stats.categories)) {
          const status = categoryStats.overLimit ? '⚠️  OVER LIMIT' :
            categoryStats.nearLimit ? '⚡ NEAR LIMIT' : '✅ OK';
          console.log(`     ${categoryId}: ${categoryStats.count} sets ${status}`);
          if (categoryStats.evictedCount > 0) {
            console.log(`       Evicted: ${categoryStats.evictedCount} sets`);
          }
        }
      }

    } catch (error) {
      console.log(`   Error getting cache statistics: ${error.message}`);
    }
  }

  /**
   * Simulate age-based eviction by manually setting old timestamps
   */
  async simulateAgeBasedEviction(userId, categoryId) {
    try {
      // Get current allocations
      const currentSets = await this.allocator.queueManager.getUserCategoryAllocations(userId, categoryId);

      if (currentSets.length < 2) {
        console.log('   Not enough sets to simulate age-based eviction');
        return;
      }

      // Set some sets to be very old (older than 2 months)
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 3); // 3 months ago

      const timestampKey = `${this.allocator.queueManager.getUserAllocationsKey(userId)}:timestamps`;
      const setsToAge = currentSets.slice(0, 2); // Age the first 2 sets

      for (const setId of setsToAge) {
        await this.allocator.queueManager.client.hSet(timestampKey, `${categoryId}:${setId}`, oldDate.toISOString());
      }

      console.log(`   Simulated aging of sets: ${setsToAge.join(', ')}`);

      // Trigger eviction to remove old sets
      const evictionResult = await this.allocator.queueManager.applyCacheEvictionWithTimestamps(userId, categoryId);

      if (evictionResult.removedCount > 0) {
        console.log(`   Age-based eviction removed ${evictionResult.removedCount} old sets`);
        console.log(`   Removed sets: ${evictionResult.removedSets.join(', ')}`);
      } else {
        console.log('   No sets were removed by age-based eviction');
      }

    } catch (error) {
      console.log(`   Error simulating age-based eviction: ${error.message}`);
    }
  }
}

// Run demo if this file is executed directly
if (require.main === module) {
  const demo = new CacheEvictionDemo();
  demo.runDemo().catch(error => {
    console.error('❌ Demo error:', error);
    process.exit(1);
  });
}

module.exports = CacheEvictionDemo;
