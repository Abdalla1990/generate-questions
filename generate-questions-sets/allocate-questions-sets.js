// allocate-questions-sets.js - CLI for managing user question set allocations
const SetsAllocator = require('./sets-allocator');

class AllocationCLI {
  constructor() {
    this.allocator = new SetsAllocator();
  }

  /**
   * Display help information
   */
  showHelp() {
    console.log(`
🎯 Question Sets Allocation CLI

Usage: node allocate-questions-sets.js <command> [options]

Commands:
  allocate <userId> <category1,category2,...>  - Allocate sets for user across categories
  status <userId>                              - Show user's current allocations
  stats <userId>                               - Show detailed user statistics
  check <userId> <category1,category2,...>     - Check availability without allocating
  reset <userId>                               - Reset all allocations for user
  users                                        - List all users with allocations
  health                                       - Check system health
  
Cache Management:
  cache-stats <userId>                         - Show detailed cache statistics for user
  cache-evict <userId>                         - Manually trigger cache eviction for user
  cache-config                                 - Show current cache configuration
  cache-config-set <maxSets> <maxMonths>       - Update cache configuration

Examples:
  node allocate-questions-sets.js allocate user123 tech,science,math
  node allocate-questions-sets.js status user123
  node allocate-questions-sets.js stats user123
  node allocate-questions-sets.js check user123 tech,science
  node allocate-questions-sets.js reset user123
  node allocate-questions-sets.js users
  node allocate-questions-sets.js health
  node allocate-questions-sets.js cache-stats user123
  node allocate-questions-sets.js cache-evict user123
  node allocate-questions-sets.js cache-config
  node allocate-questions-sets.js cache-config-set 15 3
`);
  }

  /**
   * Parse comma-separated categories
   */
  parseCategories(categoriesString) {
    return categoriesString.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0);
  }

  /**
   * Allocate sets for a user
   */
  async allocateSets(userId, categoriesString) {
    try {
      await this.allocator.initialize();

      const categoryIds = this.parseCategories(categoriesString);
      console.log(`\n🎯 Allocating sets for user: ${userId}`);
      console.log(`📂 Categories: ${categoryIds.join(', ')}`);

      const results = await this.allocator.allocateSetsForUser(userId, categoryIds);

      console.log('\n📊 Allocation Results:');
      console.log('======================');

      if (Object.keys(results.successful).length > 0) {
        console.log('\n✅ Successful Allocations:');
        for (const [categoryId, setId] of Object.entries(results.successful)) {
          console.log(`  ${categoryId}: ${setId}`);
        }
      }

      if (Object.keys(results.failed).length > 0) {
        console.log('\n❌ Failed Allocations:');
        for (const [categoryId, reason] of Object.entries(results.failed)) {
          console.log(`  ${categoryId}: ${reason}`);
        }
      }

      console.log(`\n📈 Summary: ${results.summary.successful}/${results.summary.requested} successful`);

    } catch (error) {
      console.error('❌ Error allocating sets:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * Show user's current allocations
   */
  async showUserStatus(userId) {
    try {
      await this.allocator.initialize();

      const allocations = await this.allocator.getUserAllocations(userId);

      console.log(`\n📋 Current Allocations for User: ${userId}`);
      console.log('==========================================');

      if (Object.keys(allocations).length === 0) {
        console.log('No allocations found for this user.');
        return;
      }

      for (const [categoryId, setIds] of Object.entries(allocations)) {
        console.log(`\n📂 ${categoryId}:`);
        console.log(`  Sets: ${setIds.length}`);
        console.log(`  IDs: ${setIds.join(', ')}`);
      }

    } catch (error) {
      console.error('❌ Error getting user status:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * Show detailed user statistics
   */
  async showUserStats(userId) {
    try {
      await this.allocator.initialize();

      const stats = await this.allocator.getUserStats(userId);

      console.log(`\n📊 Detailed Statistics for User: ${userId}`);
      console.log('==========================================');
      console.log(`Total Allocations: ${stats.totalAllocations}`);
      console.log(`Categories: ${stats.categoriesCount}`);
      console.log(`Last Updated: ${stats.lastUpdated || 'Never'}`);

      console.log('\n📂 Category Breakdown:');
      for (const [categoryId, categoryStats] of Object.entries(stats.categories)) {
        console.log(`\n  ${categoryId}:`);
        console.log(`    Count: ${categoryStats.count}`);
        console.log(`    Last Allocated: ${categoryStats.lastAllocated || 'None'}`);
        console.log(`    Set IDs: ${categoryStats.setIds.join(', ')}`);
      }

    } catch (error) {
      console.error('❌ Error getting user stats:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * Check availability for categories without allocating
   */
  async checkAvailability(userId, categoriesString) {
    try {
      await this.allocator.initialize();

      const categoryIds = this.parseCategories(categoriesString);
      console.log(`\n🔍 Checking Availability for User: ${userId}`);
      console.log(`📂 Categories: ${categoryIds.join(', ')}`);

      const availability = await this.allocator.checkAvailability(userId, categoryIds);

      console.log('\n📊 Availability Status:');
      console.log('========================');

      for (const [categoryId, status] of Object.entries(availability)) {
        console.log(`\n📂 ${categoryId}:`);
        if (status.error) {
          console.log(`  ❌ Error: ${status.error}`);
        } else {
          console.log(`  Total Available: ${status.totalAvailable}`);
          console.log(`  User Allocated: ${status.userAllocated}`);
          console.log(`  New Available: ${status.newAvailable}`);
          console.log(`  Status: ${status.hasNewSets ? '✅ Has new sets' : '❌ No new sets'}`);
        }
      }

    } catch (error) {
      console.error('❌ Error checking availability:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * Reset user allocations
   */
  async resetUser(userId) {
    try {
      await this.allocator.initialize();

      console.log(`\n🔄 Resetting allocations for user: ${userId}`);

      const result = await this.allocator.resetUserAllocations(userId);

      if (result) {
        console.log('✅ User allocations reset successfully');
      } else {
        console.log('❌ Failed to reset user allocations');
      }

    } catch (error) {
      console.error('❌ Error resetting user:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * List all users with allocations
   */
  async listUsers() {
    try {
      await this.allocator.initialize();

      const users = await this.allocator.getAllUsersSummary();

      console.log('\n👥 All Users with Allocations:');
      console.log('===============================');

      if (users.length === 0) {
        console.log('No users found with allocations.');
        return;
      }

      users.forEach(user => {
        console.log(`\n👤 ${user.userId}:`);
        if (user.error) {
          console.log(`  ❌ Error: ${user.error}`);
        } else {
          console.log(`  Total Allocations: ${user.totalAllocations}`);
          console.log(`  Categories: ${user.categoriesCount} (${user.categories.join(', ')})`);
          console.log(`  Last Updated: ${user.lastUpdated || 'Never'}`);
        }
      });

    } catch (error) {
      console.error('❌ Error listing users:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * Check system health
   */
  async checkHealth() {
    try {
      await this.allocator.initialize();

      const health = await this.allocator.healthCheck();

      console.log('\n🏥 System Health Check:');
      console.log('========================');
      console.log(`Overall Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.log(`Allocator Initialized: ${health.initialized ? '✅ Yes' : '❌ No'}`);
      console.log(`Redis Connected: ${health.redisConnected ? '✅ Yes' : '❌ No'}`);

      if (health.error) {
        console.log(`Error: ${health.error}`);
      }

    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    } finally {
      await this.allocator.cleanup();
    }
  }

  /**
   * Show detailed cache statistics for a user
   */
  async showCacheStats(userId) {
    try {
      await this.allocator.initialize();

      const stats = await this.allocator.queueManager.getUserCacheStats(userId);

      console.log(`\n📊 Cache Statistics for User: ${userId}`);
      console.log(`Total Allocations: ${stats.totalAllocations}`);
      console.log(`Categories: ${stats.categoriesCount}`);
      console.log(`Total Evicted: ${stats.evictionStats.totalEvicted}`);
      console.log(`Last Eviction: ${stats.evictionStats.lastEvictionDate || 'Never'}`);

      console.log(`\n🏥 Cache Health:`);
      console.log(`Categories near limit (>80%): ${stats.cacheHealth.categoriesNearLimit}`);
      console.log(`Categories with old sets: ${stats.cacheHealth.categoriesOverAge}`);

      console.log(`\n📂 Category Details:`);
      for (const [categoryId, categoryStats] of Object.entries(stats.categories)) {
        console.log(`\n  Category: ${categoryId}`);
        console.log(`    Count: ${categoryStats.count} ${categoryStats.overLimit ? '⚠️  OVER LIMIT' : categoryStats.nearLimit ? '⚡ NEAR LIMIT' : '✅'}`);
        console.log(`    Evicted: ${categoryStats.evictedCount}`);
        console.log(`    Last Evicted: ${categoryStats.lastEvicted || 'Never'}`);
        console.log(`    Oldest Set: ${categoryStats.oldestSetAge ? new Date(categoryStats.oldestSetAge).toLocaleString() : 'Unknown'} ${categoryStats.hasOldSets ? '🕰️  HAS OLD SETS' : ''}`);
        console.log(`    Newest Set: ${categoryStats.newestSetAge ? new Date(categoryStats.newestSetAge).toLocaleString() : 'Unknown'}`);
      }

    } catch (error) {
      console.error('❌ Error getting cache stats:', error.message);
    }
  }

  /**
   * Manually trigger cache eviction for a user
   */
  async triggerCacheEviction(userId) {
    try {
      await this.allocator.initialize();

      console.log(`🧹 Triggering cache eviction for user: ${userId}`);
      const summary = await this.allocator.queueManager.triggerCacheEvictionForUser(userId);

      console.log(`\n✅ Cache Eviction Complete:`);
      console.log(`Categories Processed: ${summary.categoriesProcessed}`);
      console.log(`Total Sets Removed: ${summary.totalRemoved}`);

      if (summary.totalRemoved > 0) {
        console.log(`\n📋 Category Details:`);
        for (const [categoryId, result] of Object.entries(summary.categoryResults)) {
          if (result.removedCount > 0) {
            console.log(`  ${categoryId}: Removed ${result.removedCount} sets (${result.reason.join(', ')})`);
            console.log(`    Evicted sets: ${result.removedSets.join(', ')}`);
          }
        }
      } else {
        console.log(`🎉 No eviction needed - all allocations are within limits and age restrictions.`);
      }

    } catch (error) {
      console.error('❌ Error triggering cache eviction:', error.message);
    }
  }

  /**
   * Show current cache configuration
   */
  async showCacheConfig() {
    try {
      const QueueManager = require('./redis-queue/queue-manager');
      const config = QueueManager.getCacheConfig();

      console.log(`\n⚙️  Current Cache Configuration:`);
      console.log(`Max Sets Per Category: ${config.MAX_SETS_PER_CATEGORY}`);
      console.log(`Max Age (Months): ${config.MAX_AGE_MONTHS}`);

    } catch (error) {
      console.error('❌ Error getting cache config:', error.message);
    }
  }

  /**
   * Update cache configuration
   */
  async updateCacheConfig(maxSets, maxMonths) {
    try {
      const QueueManager = require('./redis-queue/queue-manager');

      const newConfig = {};
      if (maxSets !== undefined) {
        newConfig.maxSetsPerCategory = parseInt(maxSets);
        if (isNaN(newConfig.maxSetsPerCategory) || newConfig.maxSetsPerCategory < 1) {
          throw new Error('Max sets per category must be a positive integer');
        }
      }
      if (maxMonths !== undefined) {
        newConfig.maxAgeMonths = parseInt(maxMonths);
        if (isNaN(newConfig.maxAgeMonths) || newConfig.maxAgeMonths < 1) {
          throw new Error('Max age months must be a positive integer');
        }
      }

      QueueManager.updateCacheConfig(newConfig);

      const updatedConfig = QueueManager.getCacheConfig();
      console.log(`\n✅ Cache Configuration Updated:`);
      console.log(`Max Sets Per Category: ${updatedConfig.MAX_SETS_PER_CATEGORY}`);
      console.log(`Max Age (Months): ${updatedConfig.MAX_AGE_MONTHS}`);

    } catch (error) {
      console.error('❌ Error updating cache config:', error.message);
    }
  }

  /**
   * Run the CLI with command line arguments
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const param1 = args[1];
    const param2 = args[2];

    switch (command) {
      case 'allocate':
        if (!param1 || !param2) {
          console.log('❌ User ID and categories required for allocate command');
          this.showHelp();
          break;
        }
        await this.allocateSets(param1, param2);
        break;

      case 'status':
        if (!param1) {
          console.log('❌ User ID required for status command');
          this.showHelp();
          break;
        }
        await this.showUserStatus(param1);
        break;

      case 'stats':
        if (!param1) {
          console.log('❌ User ID required for stats command');
          this.showHelp();
          break;
        }
        await this.showUserStats(param1);
        break;

      case 'check':
        if (!param1 || !param2) {
          console.log('❌ User ID and categories required for check command');
          this.showHelp();
          break;
        }
        await this.checkAvailability(param1, param2);
        break;

      case 'reset':
        if (!param1) {
          console.log('❌ User ID required for reset command');
          this.showHelp();
          break;
        }
        await this.resetUser(param1);
        break;

      case 'users':
        await this.listUsers();
        break;

      case 'health':
        await this.checkHealth();
        break;

      case 'cache-stats':
        if (!param1) {
          console.log('❌ User ID required for cache-stats command');
          this.showHelp();
          break;
        }
        await this.showCacheStats(param1);
        break;

      case 'cache-evict':
        if (!param1) {
          console.log('❌ User ID required for cache-evict command');
          this.showHelp();
          break;
        }
        await this.triggerCacheEviction(param1);
        break;

      case 'cache-config':
        await this.showCacheConfig();
        break;

      case 'cache-config-set':
        await this.updateCacheConfig(param1, param2);
        break;

      case 'help':
      case '--help':
      case '-h':
        this.showHelp();
        break;

      default:
        console.log('❌ Unknown command:', command);
        this.showHelp();
        break;
    }
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new AllocationCLI();
  cli.run().catch(error => {
    console.error('❌ CLI error:', error);
    process.exit(1);
  });
}

module.exports = AllocationCLI;
