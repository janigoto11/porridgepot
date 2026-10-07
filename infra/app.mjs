import {
  App,
  Stack,
  Duration,
  RemovalPolicy,
  CfnOutput,
  CfnParameter,
  CustomResource,
} from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as waf from "aws-cdk-lib/aws-wafv2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
const app = new App();
const edge = new Stack(app, "PorridgePotEdge", {
  env: { account: "818028063586", region: "us-east-1" },
});
const addresses = new CfnParameter(edge, "AllowedIpv4Cidrs", {
  type: "CommaDelimitedList",
  noEcho: true,
  description: "Allowed public IPv4 networks; all other clients are blocked",
});
const ips = new waf.CfnIPSet(edge, "AllowedAddresses", {
  scope: "CLOUDFRONT",
  ipAddressVersion: "IPV4",
  addresses: addresses.valueAsList,
});
const visibility = (metricName) => ({
  cloudWatchMetricsEnabled: true,
  sampledRequestsEnabled: false,
  metricName,
});
const acl = new waf.CfnWebACL(edge, "WebAcl", {
  scope: "CLOUDFRONT",
  defaultAction: { allow: {} },
  visibilityConfig: visibility("PorridgePot"),
  rules: [
    {
      name: "BlockOutsideAllowlist",
      priority: 0,
      action: { block: {} },
      statement: { notStatement: { statement: { ipSetReferenceStatement: { arn: ips.attrArn } } } },
      visibilityConfig: visibility("OutsideAllowlist"),
    },
    {
      name: "CommonThreats",
      priority: 1,
      overrideAction: { none: {} },
      statement: {
        managedRuleGroupStatement: { vendorName: "AWS", name: "AWSManagedRulesCommonRuleSet" },
      },
      visibilityConfig: visibility("CommonThreats"),
    },
  ],
});
new CfnOutput(edge, "WebAclArn", { value: acl.attrArn });
const stack = new Stack(app, "PorridgePot", {
  description: "Porridge Pot AI SDLC laboratory",
  env: {
    account: "818028063586",
    region: "eu-north-1",
  },
});
const webAclArn = new CfnParameter(stack, "WebAclArn", {
  type: "String",
  allowedPattern: "arn:aws:wafv2:us-east-1:818028063586:global/webacl/.+",
});
const demoUsername = new CfnParameter(stack, "DemoUsername", {
  type: "String",
  allowedPattern: "[A-Za-z0-9._-]{1,80}",
});
const demoPasswordHash = new CfnParameter(stack, "DemoPasswordHash", {
  type: "String",
  noEcho: true,
  allowedPattern: "[a-f0-9]{32}:[a-f0-9]{128}",
});
const originSecret = new secretsmanager.Secret(stack, "OriginSecret", {
  generateSecretString: { passwordLength: 48, excludePunctuation: true },
  removalPolicy: RemovalPolicy.DESTROY,
});
// Dynamic references are resolved by CloudFormation, not during offline synthesis.
const originHeader = originSecret.secretValue.unsafeUnwrap();
const table = new dynamodb.Table(stack, "Users", {
  partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: RemovalPolicy.DESTROY,
});
const bucket = new s3.Bucket(stack, "Web", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  autoDeleteObjects: true,
  enforceSSL: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: RemovalPolicy.DESTROY,
});
const logGroup = new logs.LogGroup(stack, "ApiLogs", {
  retention: logs.RetentionDays.ONE_WEEK,
  removalPolicy: RemovalPolicy.DESTROY,
});
const apiFunction = new lambda.Function(stack, "ApiFunction", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: lambda.Code.fromAsset("dist/api"),
  memorySize: 512,
  timeout: Duration.seconds(10),
  logGroup,
  environment: { USERS_TABLE: table.tableName, ORIGIN_VERIFY_SECRET: originHeader },
});
table.grantReadWriteData(apiFunction);
const api = new apigateway.HttpApi(stack, "Api");
api.addRoutes({
  path: "/api/{proxy+}",
  methods: [apigateway.HttpMethod.ANY],
  integration: new HttpLambdaIntegration("Handler", apiFunction),
});
const stage = api.defaultStage.node.defaultChild;
stage.defaultRouteSettings = { throttlingBurstLimit: 10, throttlingRateLimit: 5 };
const distribution = new cloudfront.Distribution(stack, "Distribution", {
  defaultRootObject: "index.html",
  webAclId: webAclArn.valueAsString,
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
  },
  additionalBehaviors: {
    "/api/*": {
      origin: new origins.HttpOrigin(
        `${api.apiId}.execute-api.${stack.region}.${stack.urlSuffix}`,
        { customHeaders: { "x-porridgepot-origin": originHeader } },
      ),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
    },
  },
});
new BucketDeployment(stack, "DeployWeb", {
  logGroup: new logs.LogGroup(stack, "WebDeploymentLogs", {
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  }),
  sources: [Source.asset("dist/web")],
  destinationBucket: bucket,
  distribution,
  distributionPaths: ["/*"],
});
new CfnOutput(stack, "WebsiteUrl", { value: `https://${distribution.distributionDomainName}` });
new CfnOutput(stack, "UsersTableName", { value: table.tableName });

const seed = new lambda.Function(stack, "SeedUser", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "seed.handler",
  code: lambda.Code.fromAsset("dist/seed"),
  timeout: Duration.seconds(60),
  logGroup: new logs.LogGroup(stack, "SeedLogs", {
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY,
  }),
});
seed.addToRolePolicy(
  new iam.PolicyStatement({ actions: ["dynamodb:PutItem"], resources: [table.tableArn] }),
);
const demoUser = new CustomResource(stack, "DemoUser", {
  serviceToken: seed.functionArn,
  serviceTimeout: Duration.seconds(120),
  properties: {
    TableName: table.tableName,
    Username: demoUsername.valueAsString,
    PasswordHash: demoPasswordHash.valueAsString,
  },
});

demoUser.node.addDependency(seed);

// Keep the CloudFormation timeout numeric (CDK currently serializes it as a string).
demoUser.node.defaultChild.addPropertyOverride("ServiceTimeout", 120);
// The S3 cleanup provider also owns a log group so teardown does not orphan its logs.
const cleanupProvider = stack.node.tryFindChild(
  "Custom::S3AutoDeleteObjectsCustomResourceProvider",
);
const cleanupHandler = cleanupProvider?.node.tryFindChild("Handler");
if (!cleanupHandler) throw new Error("S3 cleanup provider structure changed; review log lifecycle");
const cleanupLogs = new logs.LogGroup(stack, "CleanupLogs", {
  retention: logs.RetentionDays.ONE_WEEK,
  removalPolicy: RemovalPolicy.DESTROY,
});
cleanupHandler.addPropertyOverride("LoggingConfig.LogGroup", cleanupLogs.logGroupName);
