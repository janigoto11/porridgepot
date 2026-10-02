import { App, Stack, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
const app = new App();
const stack = new Stack(app, "PorridgePot", {
  description: "Porridge Pot AI SDLC laboratory",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "eu-north-1",
  },
});
const table = new dynamodb.Table(stack, "Users", {
  partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "expiresAt",
  removalPolicy: RemovalPolicy.RETAIN,
});
const bucket = new s3.Bucket(stack, "Web", {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: RemovalPolicy.RETAIN,
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
  environment: { USERS_TABLE: table.tableName },
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
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
  },
  additionalBehaviors: {
    "/api/*": {
      origin: new origins.HttpOrigin(`${api.apiId}.execute-api.${stack.region}.${stack.urlSuffix}`),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
    },
  },
});
new BucketDeployment(stack, "DeployWeb", {
  sources: [Source.asset("dist/web")],
  destinationBucket: bucket,
  distribution,
  distributionPaths: ["/*"],
});
new CfnOutput(stack, "WebsiteUrl", { value: `https://${distribution.distributionDomainName}` });
new CfnOutput(stack, "UsersTableName", { value: table.tableName });
