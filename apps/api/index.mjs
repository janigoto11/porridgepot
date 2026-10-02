import { createHandler } from "./handler.mjs";
import { dynamoStore } from "./store.mjs";
export const handler = createHandler(dynamoStore(process.env.USERS_TABLE));
