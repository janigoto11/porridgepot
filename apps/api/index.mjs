import { createHandler } from "./handler.mjs";
import { dynamoStore } from "./store.mjs";
if (!process.env.ORIGIN_VERIFY_SECRET) throw new Error("Missing origin verification secret");
export const handler = createHandler(dynamoStore(process.env.USERS_TABLE), {
  originSecret: process.env.ORIGIN_VERIFY_SECRET,
});
