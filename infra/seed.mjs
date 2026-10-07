import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
const client = new DynamoDBClient({});
export function createSeedHandler(putItem, send = fetch) {
  return async (event) => {
    let status = "SUCCESS";
    try {
      if (event.RequestType !== "Delete") {
        const { TableName, Username, PasswordHash } = event.ResourceProperties;
        if (
          !/^[A-Za-z0-9._-]{1,80}$/.test(Username) ||
          !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(PasswordHash)
        )
          throw new Error("Invalid seed");
        await putItem({
          TableName,
          Item: { pk: { S: `USER#${Username}` }, passwordHash: { S: PasswordHash } },
        });
      }
    } catch {
      status = "FAILED";
    }
    // Never log the event: it contains both a password hash and a signed response URL.
    const response = await send(event.ResponseURL, {
      method: "PUT",
      headers: { "content-type": "" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        Status: status,
        Reason: status === "FAILED" ? "Demo user initialization failed" : "Complete",
        PhysicalResourceId: event.PhysicalResourceId || "porridgepot-demo-user",
        StackId: event.StackId,
        RequestId: event.RequestId,
        LogicalResourceId: event.LogicalResourceId,
        NoEcho: true,
      }),
    });
    if (!response.ok) throw new Error("CloudFormation response failed");
  };
}
export const handler = createSeedHandler((input) => client.send(new PutItemCommand(input)));
