import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
export const listsKey = (username) => `LISTS#${username}`;
export function dynamoStore(tableName) {
  if (!tableName) throw new Error("USERS_TABLE is required");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const get = async (pk) =>
    (await client.send(new GetCommand({ TableName: tableName, Key: { pk }, ConsistentRead: true })))
      .Item;
  return {
    get,
    put: (item) => client.send(new PutCommand({ TableName: tableName, Item: item })),
    delete: (pk) => client.send(new DeleteCommand({ TableName: tableName, Key: { pk } })),
    getLists: async (username) => (await get(listsKey(username)))?.lists ?? [],
    putLists: async (username, lists) => {
      await client.send(
        new PutCommand({ TableName: tableName, Item: { pk: listsKey(username), lists } }),
      );
    },
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
    getLists: async (username) => structuredClone(items.get(listsKey(username))?.lists ?? []),
    putLists: async (username, lists) => {
      const pk = listsKey(username);
      items.set(pk, { pk, lists: structuredClone(lists) });
    },
  };
}
