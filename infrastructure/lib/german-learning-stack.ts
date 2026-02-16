import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export class GermanLearningStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── S3: raw source bucket ──────────────────────────────────────────────
    const rawBucket = new s3.Bucket(this, "RawSourceBucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ── DynamoDB: exercises  ──────────────────────────────────────────
    // PK: level (e.g. "a1")
    // SK: typeLesson (e.g. "nouns#03") — allows Query by level + begins_with(type#) filter
    const exercisesTable = new dynamodb.Table(this, "ExercisesTable", {
      partitionKey: { name: "level", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "typeLesson", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Lambda: ingestion + exercise pre-generation ───────────────────────
    const ingestionFn = new lambda.Function(this, "IngestionFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.main",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../ingestion/lambda_ingestion"),
      ),
      timeout: cdk.Duration.minutes(10),
      memorySize: 512,
      environment: {
        TABLE_NAME: exercisesTable.tableName,
        RAW_BUCKET: rawBucket.bucketName,
        MODEL_ID: "us.anthropic.claude-haiku-4-5",
      },
    });

    rawBucket.grantRead(ingestionFn);
    exercisesTable.grantWriteData(ingestionFn);
    ingestionFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      }),
    );

    // S3 trigger on any .md upload
    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(ingestionFn),
      { suffix: ".md" },
    );

    // ── Lambda: exercise API ───────────────────────────────────────────────
    const exerciseApiFn = new lambda.Function(this, "ExerciseApiFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.main",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../ingestion/lambda_exercise_api"),
      ),
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: exercisesTable.tableName,
      },
    });

    exercisesTable.grantReadData(exerciseApiFn);

    // ── API Gateway ────────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, "ExercisesApi", {
      restApiName: "german-learning-exercises",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
      },
    });

    const exercises = api.root.addResource("exercises");
    const byLevel = exercises.addResource("{level}");
    byLevel.addMethod("GET", new apigateway.LambdaIntegration(exerciseApiFn));

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "RawBucketName", { value: rawBucket.bucketName });
    new cdk.CfnOutput(this, "ExercisesTableName", {
      value: exercisesTable.tableName,
    });
    new cdk.CfnOutput(this, "ExercisesApiUrl", {
      value: `${api.url}exercises`,
      description: "Set this as VITE_EXERCISES_API_URL in Amplify Console",
    });
  }
}
