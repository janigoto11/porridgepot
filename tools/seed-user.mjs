import { hashPassword } from "../apps/api/auth.mjs";
import { dynamoStore } from "../apps/api/store.mjs";
const username = process.env.SEED_USERNAME;
const password = process.env.SEED_PASSWORD;
if (
  !username ||
  !/^[a-zA-Z0-9._-]{1,80}$/.test(username) ||
  !password ||
  password.length < 12 ||
  password.length > 256
)
  throw new Error("Set SEED_USERNAME and SEED_PASSWORD (12–256 characters).");
await dynamoStore(process.env.USERS_TABLE).put({
  pk: `USER#${username}`,
  passwordHash: await hashPassword(password),
});
console.log(`Test user saved: ${username}`);
