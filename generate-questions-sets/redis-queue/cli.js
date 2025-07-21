// redis-queue/cli.js - Command line interface for Redis queue management
const SetTracker = require('./set-tracker');

class QueueCLI {
  constructor() {
    this.setTracker = new SetTracker();
  }

  /**
   * Display help information
   */
  showHelp() {
    console.log(`
📊 Redis Queue CLI for Question Sets

Usage: node cli.js <command> [options]

Commands:
  status                    - Show queue status for all categories
  status <categoryId>       - Show queue status for specific category
  next <categoryId>         - Get next available set for category
  clear <categoryId>        - Clear queue for specific category
  info                      - Show detailed queue information
  health                    - Check Redis connection health

Examples:
  node cli.js status
  node cli.js status tech
  node cli.js next tech
  node cli.js clear tech
  node cli.js info
  node cli.js health
`);
  }

  /**
   * Show status for all categories or a specific category
   */
  async showStatus(categoryId = null) {
    try {
      await this.setTracker.initialize();

      if (categoryId) {
        const availability = await this.setTracker.getCategoryAvailability(categoryId);
        console.log(`\n📊 Queue Status for Category: ${categoryId}`);
        console.log(`Available Sets: ${availability.count}`);
        console.log(`Status: ${availability.available ? '✅ Available' : '❌ Empty'}`);

        if (availability.metadata.last_updated) {
          console.log(`Last Updated: ${availability.metadata.last_updated}`);
          console.log(`Last Batch Size: ${availability.metadata.last_batch_size || 0}`);
        }
      } else {
        const availabilities = await this.setTracker.getAllCategoriesAvailability();

        console.log('\n📊 Queue Status for All Categories:');
        console.log('=====================================');

        if (availabilities.length === 0) {
          console.log('No categories found in queue');
          return;
        }

        availabilities.forEach(avail => {
          const status = avail.available ? '✅' : '❌';
          console.log(`${status} ${avail.categoryId}: ${avail.count} sets available`);
        });
      }
    } catch (error) {
      console.error('❌ Error showing status:', error.message);
    } finally {
      await this.setTracker.cleanup();
    }
  }

  /**
   * Get next available set for a category
   */
  async getNextSet(categoryId) {
    try {
      await this.setTracker.initialize();

      const setId = await this.setTracker.getNextAvailableSet(categoryId);

      if (setId) {
        console.log(`\n🎯 Next Available Set for ${categoryId}:`);
        console.log(`Set ID: ${setId}`);
      } else {
        console.log(`\n⚠️  No available sets for category: ${categoryId}`);
      }
    } catch (error) {
      console.error('❌ Error getting next set:', error.message);
    } finally {
      await this.setTracker.cleanup();
    }
  }

  /**
   * Clear queue for a category
   */
  async clearQueue(categoryId) {
    try {
      await this.setTracker.initialize();

      const result = await this.setTracker.clearCategoryQueue(categoryId);

      if (result) {
        console.log(`\n🧹 Successfully cleared queue for category: ${categoryId}`);
      } else {
        console.log(`\n❌ Failed to clear queue for category: ${categoryId}`);
      }
    } catch (error) {
      console.error('❌ Error clearing queue:', error.message);
    } finally {
      await this.setTracker.cleanup();
    }
  }

  /**
   * Show detailed queue information
   */
  async showInfo() {
    try {
      await this.setTracker.initialize();

      const info = await this.setTracker.getQueueInfo();

      console.log('\n📈 Detailed Queue Information:');
      console.log('===============================');
      console.log(`Total Categories: ${info.total_categories}`);
      console.log(`Categories with Available Sets: ${info.categories_with_available_sets}`);
      console.log(`Total Available Sets: ${info.total_available_sets}`);

      console.log('\n📋 Category Details:');
      info.categories.forEach(cat => {
        console.log(`  ${cat.categoryId}:`);
        console.log(`    Available Sets: ${cat.available_sets}`);
        console.log(`    Last Updated: ${cat.last_updated || 'Never'}`);
        console.log(`    Last Batch Size: ${cat.last_batch_size}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Error showing info:', error.message);
    } finally {
      await this.setTracker.cleanup();
    }
  }

  /**
   * Check Redis health
   */
  async checkHealth() {
    try {
      await this.setTracker.initialize();

      const isHealthy = await this.setTracker.healthCheck();

      if (isHealthy) {
        console.log('\n✅ Redis connection is healthy');
      } else {
        console.log('\n❌ Redis connection is not healthy');
      }
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
    } finally {
      await this.setTracker.cleanup();
    }
  }

  /**
   * Run the CLI with command line arguments
   */
  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const param = args[1];

    switch (command) {
      case 'status':
        await this.showStatus(param);
        break;
      case 'next':
        if (!param) {
          console.log('❌ Category ID required for next command');
          this.showHelp();
          break;
        }
        await this.getNextSet(param);
        break;
      case 'clear':
        if (!param) {
          console.log('❌ Category ID required for clear command');
          this.showHelp();
          break;
        }
        await this.clearQueue(param);
        break;
      case 'info':
        await this.showInfo();
        break;
      case 'health':
        await this.checkHealth();
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
  const cli = new QueueCLI();
  cli.run().catch(error => {
    console.error('❌ CLI error:', error);
    process.exit(1);
  });
}

module.exports = QueueCLI;
