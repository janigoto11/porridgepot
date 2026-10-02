import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
export function dynamoStore(tableName) {
  if (!tableName) throw new Error("USERS_TABLE is required");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return {
    get: async (pk) =>
      (
        await client.send(
          new GetCommand({ TableName: tableName, Key: { pk }, ConsistentRead: true }),
        )
      ).Item,
    put: (item) => client.send(new PutCommand({ TableName: tableName, Item: item })),
    delete: (pk) => client.send(new DeleteCommand({ TableName: tableName, Key: { pk } })),
  };
}
export function memoryStore() {
  const items = new Map();
  return {
    get: async (pk) => items.get(pk),
    put: async (item) => {
      items.set(item.pk, item);
    },
    delete: async (pk) => {
      items.delete(pk);
    },
  };
}
