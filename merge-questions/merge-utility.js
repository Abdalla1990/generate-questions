// merge-utility.js - Enhanced merge utility with additional features
const fs = require('fs');
const path = require('path');
const { mergeQuestionFiles } = require('./merge-questions');

/**
 * Enhanced merge utility with additional options
 */
class QuestionMergeUtility {
  constructor() {
    this.config = {
      outputDir: 'merged-output',
      backupOriginals: true,
      generateReport: true,
      verbose: false
    };
  }

  /**
   * Set configuration options
   * @param {Object} options - Configuration options
   */
  setConfig(options) {
    this.config = { ...this.config, ...options };
  }

  /**
   * Create backup of original files
   * @param {Array} sourceFiles - Array of source file paths
   * @param {string} backupDir - Backup directory path
   */
  createBackup(sourceFiles, backupDir) {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    console.log(`📦 Creating backup of ${sourceFiles.length} files...`);

    sourceFiles.forEach(filePath => {
      const fileName = path.basename(filePath);
      const backupPath = path.join(backupDir, fileName);
      fs.copyFileSync(filePath, backupPath);
    });

    console.log(`✅ Backup created in: ${backupDir}`);
  }

  /**
   * Generate detailed analysis report
   * @param {Object} mergeResult - Result from merge operation
   * @param {string} reportPath - Path to save the report
   */
  generateAnalysisReport(mergeResult, reportPath) {
    const { stats, finalQuestions } = mergeResult;

    // Analyze question types
    const typeAnalysis = {};
    finalQuestions.forEach(q => {
      const type = q['question-type'] || 'unknown';
      typeAnalysis[type] = (typeAnalysis[type] || 0) + 1;
    });

    // Analyze categories
    const categoryAnalysis = {};
    finalQuestions.forEach(q => {
      const cat = q.categoryId || 'unknown';
      categoryAnalysis[cat] = (categoryAnalysis[cat] || 0) + 1;
    });

    // Analyze point distribution
    const pointAnalysis = {};
    finalQuestions.forEach(q => {
      const points = q.points || 0;
      pointAnalysis[points] = (pointAnalysis[points] || 0) + 1;
    });

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        ...stats,
        duplicateReductionPercentage: ((stats.duplicatesFound / stats.totalQuestionsFound) * 100).toFixed(2)
      },
      analysis: {
        questionTypes: typeAnalysis,
        categories: categoryAnalysis,
        pointDistribution: pointAnalysis
      },
      qualityMetrics: {
        duplicateRate: (stats.duplicatesFound / stats.totalQuestionsFound),
        normalizationRate: (stats.questionsNormalized / stats.questionsProcessed),
        validityRate: ((stats.questionsProcessed - stats.invalidQuestions) / stats.questionsProcessed)
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Analysis report saved to: ${path.basename(reportPath)}`);

    // Display summary
    console.log('\n📈 Quick Analysis:');
    console.log(`   Question Types: ${Object.keys(typeAnalysis).length} types`);
    console.log(`   Categories: ${Object.keys(categoryAnalysis).length} categories`);
    console.log(`   Point Levels: ${Object.keys(pointAnalysis).join(', ')}`);
    console.log(`   Quality Score: ${(report.qualityMetrics.validityRate * 100).toFixed(1)}%`);
  }

  /**
   * Merge questions with enhanced features
   * @param {string} rootDir - Root directory to search for questions
   * @param {Object} options - Merge options
   */
  async mergeWithOptions(rootDir, options = {}) {
    const config = { ...this.config, ...options };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Create output directory
    const outputDir = path.join(rootDir, config.outputDir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Define output files
    const outputFile = path.join(outputDir, `merged-questions-${timestamp}.json`);
    const reportFile = path.join(outputDir, `merge-report-${timestamp}.json`);
    const backupDir = path.join(outputDir, `backup-${timestamp}`);

    console.log('🚀 Enhanced Question Merge Utility');
    console.log('===================================\n');
    console.log(`📁 Output directory: ${config.outputDir}`);
    console.log(`📄 Merged file: merged-questions-${timestamp}.json`);
    if (config.generateReport) {
      console.log(`📊 Report file: merge-report-${timestamp}.json`);
    }
    console.log();

    try {
      // Create backup if requested
      if (config.backupOriginals) {
        const { findQuestionFiles } = require('./merge-questions');
        const sourceFiles = findQuestionFiles(rootDir);
        this.createBackup(sourceFiles, backupDir);
        console.log();
      }

      // Perform merge
      const result = await mergeQuestionFiles(rootDir, outputFile);

      // Generate analysis report if requested
      if (config.generateReport) {
        this.generateAnalysisReport(result, reportFile);
      }

      console.log('\n🎉 Enhanced merge completed successfully!');
      console.log(`📁 All files saved in: ${config.outputDir}/`);

      return {
        ...result,
        outputDir,
        reportFile: config.generateReport ? reportFile : null,
        backupDir: config.backupOriginals ? backupDir : null
      };

    } catch (error) {
      console.error('\n❌ Enhanced merge failed:', error.message);
      throw error;
    }
  }
}

/**
 * Command line interface
 */
async function cli() {
  const args = process.argv.slice(2);
  const utility = new QuestionMergeUtility();

  // Parse command line arguments
  const options = {};
  let i = 0;
  while (i < args.length) {
    switch (args[i]) {
      case '--no-backup':
        options.backupOriginals = false;
        break;
      case '--no-report':
        options.generateReport = false;
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
🔧 Question Merge Utility - Enhanced Features

Usage: node merge-utility.js [options]

Options:
  --no-backup      Skip creating backup of original files
  --no-report      Skip generating analysis report
  --output-dir     Specify output directory (default: merged-output)
  --verbose        Enable verbose logging
  --help           Show this help message

Examples:
  node merge-utility.js
  node merge-utility.js --output-dir custom-merge
  node merge-utility.js --no-backup --no-report
        `);
        return;
      default:
        console.warn(`Unknown option: ${args[i]}`);
    }
    i++;
  }

  try {
    const rootDir = process.cwd();
    await utility.mergeWithOptions(rootDir, options);
  } catch (error) {
    console.error('❌ CLI execution failed:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  QuestionMergeUtility
};

// Run CLI if called directly
if (require.main === module) {
  cli();
}
