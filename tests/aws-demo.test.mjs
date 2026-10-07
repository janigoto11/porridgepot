import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler } from "../apps/api/handler.mjs";
import { createSeedHandler } from "../infra/seed.mjs";
import { deployParameters, runDemo } from "../tools/demo.mjs";
import { verifyPassword } from "../apps/api/auth.mjs";
const env = { ALLOWED_IPV4_CIDRS: "203.0.113.42/32", DEMO_PASSWORD: "testing-password-only" };
test("origin protection rejects missing and forged headers before any application access", async () => {
  const handler = createHandler({}, { originSecret: "test-origin-secret" });
  const event = { rawPath: "/api/health", requestContext: { http: { method: "GET" } } };
  for (const value of [undefined, "", "wrong", "fake-origin-secret"]) {
    assert.equal(
      (await handler({ ...event, headers: { "x-porridgepot-origin": value } })).statusCode,
      403,
    );
  }
  assert.equal(
    (await handler({ ...event, headers: { "X-Porridgepot-Origin": "test-origin-secret" } }))
      .statusCode,
    200,
  );
  assert.equal(
    (await createHandler({})(event)).statusCode,
    200,
    "local development needs no AWS header",
  );
  assert.equal((await createHandler({}, { originSecret: "" })(event)).statusCode, 403);
});
test("deploy rejects broad/invalid networks and hashes the password", async () => {
  for (const cidr of [
    "",
    "0.0.0.0/0",
    "203.0.113.1",
    "::1/128",
    "999.1.2.3/32",
    "1.2.3.4/33",
    "1.2.3.4/32/1",
  ]) {
    await assert.rejects(deployParameters({ ...env, ALLOWED_IPV4_CIDRS: cidr }), /CIDR/);
  }
  await assert.rejects(deployParameters({ ...env, DEMO_PASSWORD: "short" }), /PASSWORD/);
  const params = await deployParameters(env);
  assert.equal(params.username, "demo");
  assert.equal(await verifyPassword(env.DEMO_PASSWORD, params.passwordHash), true);
});
test("AWS operations validate the account and destroy confirmation before mutation", async () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    return JSON.stringify({ Account: "184585699538" });
  };
  await assert.rejects(runDemo("destroy", {}, run), /permanently/);
  assert.equal(calls.length, 0);
  await assert.rejects(runDemo("deploy", env, run), /Wrong AWS account/);
  assert.equal(calls.length, 1);
});
test("deploy orders WAF before application and destroy reverses the order", async () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    return JSON.stringify({ Account: "818028063586" });
  };
  const read = (path) =>
    path.includes("edge")
      ? {
          PorridgePotEdge: {
            WebAclArn: "arn:aws:wafv2:us-east-1:818028063586:global/webacl/demo/1234-abcd",
          },
        }
      : { PorridgePot: { WebsiteUrl: "https://example.cloudfront.net" } };
  await runDemo("deploy", env, run, read);
  assert.deepEqual(
    calls.slice(1).map(([, args]) => args.slice(0, 2)),
    [
      ["deploy", "PorridgePotEdge"],
      ["deploy", "PorridgePot"],
    ],
  );
  assert.equal(JSON.stringify(calls).includes(env.DEMO_PASSWORD), false);
  calls.length = 0;
  await runDemo("destroy", { DESTROY_CONFIRM: "DELETE porridgepot-demo" }, run);
  assert.deepEqual(
    calls.slice(1).map(([, args]) => args.slice(0, 2)),
    [
      ["destroy", "PorridgePot"],
      ["destroy", "PorridgePotEdge"],
    ],
  );
});
test("seed initializes a hashed user, reports failures safely, and does nothing on delete", async () => {
  const params = await deployParameters(env);
  let item, response;
  const send = async (_, options) => {
    response = JSON.parse(options.body);
    return { ok: true };
  };
  const handler = createSeedHandler(async (input) => {
    item = input;
  }, send);
  const event = {
    RequestType: "Create",
    ResponseURL: "https://example.invalid",
    StackId: "stack",
    RequestId: "request",
    LogicalResourceId: "user",
    ResourceProperties: { TableName: "users", Username: "demo", PasswordHash: params.passwordHash },
  };
  await handler(event);
  assert.equal(item.Item.pk.S, "USER#demo");
  assert.equal(response.Status, "SUCCESS");
  assert.equal(JSON.stringify(response).includes(params.passwordHash), false);
  item = undefined;
  await handler({ ...event, RequestType: "Delete" });
  assert.equal(item, undefined);
  await createSeedHandler(async () => {
    throw new Error("secret failure");
  }, send)(event);
  assert.equal(response.Status, "FAILED");
  assert.equal(JSON.stringify(response).includes("secret failure"), false);
});
test("synth guarantees WAF rule order, origin header, and demo resource deletion", () => {
  const out = mkdtempSync(join(tmpdir(), "porridgepot-infra-"));
  try {
    execFileSync(process.execPath, ["infra/app.mjs"], {
      env: { ...process.env, CDK_OUTDIR: out },
      stdio: "pipe",
    });
    const app = JSON.parse(readFileSync(join(out, "PorridgePot.template.json"), "utf8"));
    const edge = JSON.parse(readFileSync(join(out, "PorridgePotEdge.template.json"), "utf8"));
    const resources = Object.values(app.Resources);
    const acl = Object.values(edge.Resources).find(
      (r) => r.Type === "AWS::WAFv2::WebACL",
    ).Properties;
    assert.ok(acl.Rules[0].Action.Block);
    assert.ok(acl.Rules[0].Statement.NotStatement.Statement.IPSetReferenceStatement);
    assert.equal(
      acl.Rules[1].Statement.ManagedRuleGroupStatement.Name,
      "AWSManagedRulesCommonRuleSet",
    );
    assert.equal(edge.Parameters.AllowedIpv4Cidrs.NoEcho, true);
    assert.equal(app.Parameters.DemoPasswordHash.NoEcho, true);
    const dist = resources.find((r) => r.Type === "AWS::CloudFront::Distribution").Properties
      .DistributionConfig;
    assert.deepEqual(dist.WebACLId, { Ref: "WebAclArn" });
    assert.equal(
      dist.Origins.find((o) => o.CustomOriginConfig).OriginCustomHeaders[0].HeaderName,
      "x-porridgepot-origin",
    );
    const api = resources.find(
      (r) => r.Type === "AWS::Lambda::Function" && r.Properties.Environment?.Variables?.USERS_TABLE,
    );
    assert.deepEqual(
      dist.Origins.find((o) => o.CustomOriginConfig).OriginCustomHeaders[0].HeaderValue,
      api.Properties.Environment.Variables.ORIGIN_VERIFY_SECRET,
    );
    for (const resource of resources.filter((r) =>
      [
        "AWS::S3::Bucket",
        "AWS::DynamoDB::Table",
        "AWS::SecretsManager::Secret",
        "AWS::Logs::LogGroup",
      ].includes(r.Type),
    ))
      assert.equal(resource.DeletionPolicy, "Delete");
    for (const fn of resources.filter((r) => r.Type === "AWS::Lambda::Function"))
      assert.ok(fn.Properties.LoggingConfig?.LogGroup, "every Lambda must use a managed log group");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
