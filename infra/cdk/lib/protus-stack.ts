import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Construct } from "constructs";
import * as path from "path";

export class ProtusStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const projectsTable = new dynamodb.Table(this, "ProjectsTable", {
      tableName: "ProtusProjects",
      partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const tasksTable = new dynamodb.Table(this, "TasksTable", {
      tableName: "ProtusTasks",
      partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "taskId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const teamTable = new dynamodb.Table(this, "TeamTable", {
      tableName: "ProtusTeam",
      partitionKey: { name: "memberId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const usersTable = new dynamodb.Table(this, "UsersTable", {
      tableName: "ProtusUsers",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const discussionsTable = new dynamodb.Table(this, "DiscussionsTable", {
      tableName: "ProtusDiscussions",
      partitionKey: { name: "messageId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });


    // Lambda Function
    const apiHandler = new lambda.Function(this, "ProtusApiHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../../apps/api/dist")),
      environment: {
        PROJECTS_TABLE: projectsTable.tableName,
        TASKS_TABLE: tasksTable.tableName,
        TEAM_TABLE: teamTable.tableName,
        USERS_TABLE: usersTable.tableName,
        DISCUSSIONS_TABLE: discussionsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Grant permissions
    projectsTable.grantReadWriteData(apiHandler);
    tasksTable.grantReadWriteData(apiHandler);
    teamTable.grantReadWriteData(apiHandler);
    usersTable.grantReadWriteData(apiHandler);
    discussionsTable.grantReadWriteData(apiHandler);

    // HTTP API Gateway
    const httpApi = new apigateway.HttpApi(this, "ProtusHttpApi", {
      apiName: "ProtusApi",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.PATCH,
          apigateway.CorsHttpMethod.DELETE,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      "LambdaIntegration",
      apiHandler
    );


    // Project Routes
    httpApi.addRoutes({
      path: "/projects",
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/projects/{projectId}",
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.PATCH],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/projects/{projectId}/tasks",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // Task Routes
    httpApi.addRoutes({
      path: "/tasks",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/tasks/{projectId}/{taskId}",
      methods: [apigateway.HttpMethod.PATCH],
      integration: lambdaIntegration,
    });

    // Team Routes
    httpApi.addRoutes({
      path: "/team",
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/team/{memberId}",
      methods: [apigateway.HttpMethod.DELETE],
      integration: lambdaIntegration,
    });


    // Auth Routes
    httpApi.addRoutes({
      path: "/auth/register",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/auth/login",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/auth/verify-otp",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/auth/logout",
      methods: [apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/auth/me",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/auth/google",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/auth/google/callback",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });


    // Users Routes
    httpApi.addRoutes({
      path: "/users",
      methods: [apigateway.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/users/{userId}",
      methods: [apigateway.HttpMethod.DELETE],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/users/{userId}/approve",
      methods: [apigateway.HttpMethod.PATCH],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/users/{userId}/role",
      methods: [apigateway.HttpMethod.PATCH],
      integration: lambdaIntegration,
    });

    // Discussions Routes
    httpApi.addRoutes({
      path: "/discussions",
      methods: [apigateway.HttpMethod.GET, apigateway.HttpMethod.POST],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/discussions/{messageId}",
      methods: [apigateway.HttpMethod.DELETE],
      integration: lambdaIntegration,
    });

    // Outputs
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.url ?? "" });
  }
}