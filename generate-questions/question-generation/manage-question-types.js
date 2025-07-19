#!/usr/bin/env node
// manage-question-types.js - Utility to manage question types configuration

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'question-types-config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    console.error('❌ Failed to load config file:', error.message);
    process.exit(1);
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('✅ Configuration saved successfully');
  } catch (error) {
    console.error('❌ Failed to save config file:', error.message);
    process.exit(1);
  }
}

function showStatus() {
  const config = loadConfig();
  console.log('\n📋 Question Types Configuration Status:');
  console.log('=====================================');

  Object.entries(config.questionTypes).forEach(([type, typeConfig]) => {
    const status = typeConfig.enabled ? '✅ ENABLED ' : '❌ DISABLED';
    const media = typeConfig.mediaProcessing ? '🎬 Media' : '📝 Text';
    console.log(`${status} | ${media} | ${type.padEnd(15)} - ${typeConfig.name}`);
  });

  const enabledCount = Object.values(config.questionTypes).filter(t => t.enabled).length;
  const totalCount = Object.keys(config.questionTypes).length;

  console.log('\n📊 Summary:');
  console.log(`Enabled types: ${enabledCount}/${totalCount}`);
  console.log(`Distribution strategy: ${config.distribution.strategy}`);

  if (config.questionTypes.image?.enabled) {
    console.log(`Allowed image contexts: ${config.questionTypes.image.allowedContexts?.join(', ') || 'none'}`);
  }
}

function enableType(type) {
  const config = loadConfig();
  if (!config.questionTypes[type]) {
    console.error(`❌ Unknown question type: ${type}`);
    console.log('Available types:', Object.keys(config.questionTypes).join(', '));
    process.exit(1);
  }

  config.questionTypes[type].enabled = true;
  saveConfig(config);
  console.log(`✅ Enabled question type: ${type}`);
}

function disableType(type) {
  const config = loadConfig();
  if (!config.questionTypes[type]) {
    console.error(`❌ Unknown question type: ${type}`);
    console.log('Available types:', Object.keys(config.questionTypes).join(', '));
    process.exit(1);
  }

  config.questionTypes[type].enabled = false;
  saveConfig(config);
  console.log(`❌ Disabled question type: ${type}`);
}

function enableOnly(types) {
  const config = loadConfig();
  const typeList = types.split(',').map(t => t.trim());

  // Validate all types exist
  for (const type of typeList) {
    if (!config.questionTypes[type]) {
      console.error(`❌ Unknown question type: ${type}`);
      console.log('Available types:', Object.keys(config.questionTypes).join(', '));
      process.exit(1);
    }
  }

  // Disable all types first
  Object.keys(config.questionTypes).forEach(type => {
    config.questionTypes[type].enabled = false;
  });

  // Enable only specified types
  typeList.forEach(type => {
    config.questionTypes[type].enabled = true;
  });

  saveConfig(config);
  console.log(`✅ Enabled only: ${typeList.join(', ')}`);
  console.log(`❌ Disabled: ${Object.keys(config.questionTypes).filter(t => !typeList.includes(t)).join(', ')}`);
}

function showHelp() {
  console.log(`
📚 Question Types Management Utility
====================================

Usage: node manage-question-types.js <command> [options]

Commands:
  status                    Show current configuration status
  enable <type>            Enable a specific question type
  disable <type>           Disable a specific question type
  enable-only <types>      Enable only specified types (comma-separated)
  help                     Show this help message

Examples:
  node manage-question-types.js status
  node manage-question-types.js enable image
  node manage-question-types.js disable video
  node manage-question-types.js enable-only "multiple-choice,image,range"

Available question types:
  • multiple-choice        Multiple choice questions
  • image                  Image recognition questions
  • voice                  Audio recognition questions  
  • range                  Numeric range questions
  • video                  Video recognition questions
`);
}

// Main execution
const [, , command, ...args] = process.argv;

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'enable':
    if (!args[0]) {
      console.error('❌ Please specify a question type to enable');
      process.exit(1);
    }
    enableType(args[0]);
    break;
  case 'disable':
    if (!args[0]) {
      console.error('❌ Please specify a question type to disable');
      process.exit(1);
    }
    disableType(args[0]);
    break;
  case 'enable-only':
    if (!args[0]) {
      console.error('❌ Please specify question types to enable (comma-separated)');
      process.exit(1);
    }
    enableOnly(args[0]);
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  default:
    if (!command) {
      showStatus(); // Default to showing status
    } else {
      console.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
    }
}
