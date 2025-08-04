const { dynamoDb, loadEnvironment } = require('./shared/dynamodb-config');
const { ensureTableExists } = require('./shared/dynamodb-config');
// Load env vars if needed
loadEnvironment();

const OLD_TABLE = 'questions';
const NEW_TABLE = 'questions-new';

const tableConfig = {
  KeySchema: [
    { AttributeName: 'id', KeyType: 'HASH' },
    { AttributeName: 'hash', KeyType: 'RANGE' }
  ],
  AttributeDefinitions: [
    { AttributeName: 'id', AttributeType: 'S' },
    { AttributeName: 'hash', AttributeType: 'S' },
    { AttributeName: 'categoryId', AttributeType: 'S' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'category-index',
      KeySchema: [
        { AttributeName: 'categoryId', KeyType: 'HASH' }
      ],
      Projection: { ProjectionType: 'ALL' }
    },
    {
      IndexName: 'hash-index',
      KeySchema: [
        { AttributeName: 'hash', KeyType: 'HASH' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ]
};


async function migrateQuestions() {
  let lastKey = undefined;
  let migrated = 0;
  await ensureTableExists(NEW_TABLE, tableConfig);
  do {
    const scanParams = {
      TableName: OLD_TABLE,
      ExclusiveStartKey: lastKey,
    };
    const data = await dynamoDb.scan(scanParams).promise();

    for (const item of data.Items) {
      // Only migrate items that have both id and hash
      if (!item.hash) {
        // Skip items without a hash, as required by the new table schema
        continue;
      }
      const putParams = {
        TableName: NEW_TABLE,
        Item: item,
      };
      await dynamoDb.put(putParams).promise();
      migrated++;
      if (migrated % 100 === 0) {
        console.log(`Migrated ${migrated} items...`);
      }
    }
    lastKey = data.LastEvaluatedKey;
  } while (lastKey);

  console.log(`✅ Migration complete. Total items migrated: ${migrated}`);
}

migrateQuestions().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
