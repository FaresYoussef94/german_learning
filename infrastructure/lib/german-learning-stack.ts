import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
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

    // ── S3: processed bucket (for markdown files and summaries) ────────────
    const processedBucket = new s3.Bucket(this, "ProcessedBucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ── DynamoDB: exercises  ──────────────────────────────────────────
    // PK: level (e.g. "a1")
    // SK: typeLesson (e.g. "lesson#03")
    const exercisesTable = new dynamodb.Table(this, "ExercisesTable", {
      partitionKey: { name: "level", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "typeLesson", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Lambda: Step 1 - OCR and Markdown Generation ───────────────────────
    const ocrAndMarkdownsFn = new lambda.Function(
      this,
      "OcrAndMarkdownsFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "handler.main",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../ingestion/lambda_ocr_markdown"),
        ),
        timeout: cdk.Duration.minutes(10),
        memorySize: 512,
        environment: {
          RAW_BUCKET: rawBucket.bucketName,
          PROCESSED_BUCKET: processedBucket.bucketName,
          MODEL_ID: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        },
      },
    );

    rawBucket.grantRead(ocrAndMarkdownsFn);
    processedBucket.grantWrite(ocrAndMarkdownsFn);
    ocrAndMarkdownsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:*"],
        resources: ["*"],
      }),
    );
    ocrAndMarkdownsFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "textract:StartDocumentTextDetection",
          "textract:GetDocumentTextDetection",
        ],
        resources: ["*"],
      }),
    );

    // ── Lambda: Step 2 - Exercise Generation ───────────────────────────────
    const exerciseGenFn = new lambda.Function(this, "ExerciseGenFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.main",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../ingestion/lambda_exercise_gen"),
      ),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        PROCESSED_BUCKET: processedBucket.bucketName,
        TABLE_NAME: exercisesTable.tableName,
        MODEL_ID: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      },
    });

    processedBucket.grantRead(exerciseGenFn);
    exercisesTable.grantWriteData(exerciseGenFn);
    exerciseGenFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:*"],
        resources: ["*"],
      }),
    );

    // ── Step Functions State Machine ────────────────────────────────────────
    const ocrTask = new tasks.LambdaInvoke(this, "OcrAndMarkdowns", {
      lambdaFunction: ocrAndMarkdownsFn,
      outputPath: "$.Payload",
    });

    const exerciseGenTask = new tasks.LambdaInvoke(this, "ExerciseGen", {
      lambdaFunction: exerciseGenFn,
      outputPath: "$.Payload",
    });

    const definition = ocrTask.next(exerciseGenTask);

    const stateMachine = new sfn.StateMachine(this, "IngestionStateMachine", {
      definition,
      timeout: cdk.Duration.minutes(20),
    });

    // ── Lambda: Workflow Trigger ────────────────────────────────────────────
    const workflowTriggerFn = new lambda.Function(
      this,
      "WorkflowTriggerFunction",
      {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: "handler.main",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "../../ingestion/lambda_workflow_trigger"),
        ),
        timeout: cdk.Duration.seconds(30),
        environment: {
          STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        },
      },
    );

    stateMachine.grantStartExecution(workflowTriggerFn);

    // S3 trigger on any .pdf upload — calls workflow trigger
    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(workflowTriggerFn),
      { suffix: ".pdf" },
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

    // ── Lambda: lesson content API ─────────────────────────────────────────
    const lessonApiFn = new lambda.Function(this, "LessonApiFunction", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "handler.main",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../ingestion/lambda_lesson_api"),
      ),
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: exercisesTable.tableName,
        PROCESSED_BUCKET: processedBucket.bucketName,
      },
    });

    exercisesTable.grantReadData(lessonApiFn);
    processedBucket.grantRead(lessonApiFn);

    // ── API Gateway ────────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, "ExercisesApi", {
      restApiName: "german-learning-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
      },
    });

    // Exercises routes
    const exercises = api.root.addResource("exercises");
    const exercisesByLevel = exercises.addResource("{level}");
    exercisesByLevel.addMethod(
      "GET",
      new apigateway.LambdaIntegration(exerciseApiFn),
    );

    // Lessons routes
    const lessons = api.root.addResource("lessons");
    const lessonsByLevel = lessons.addResource("{level}");

    // GET /lessons/{level}
    lessonsByLevel.addMethod(
      "GET",
      new apigateway.LambdaIntegration(lessonApiFn),
    );

    // GET /lessons/{level}/nouns
    const lessonsNouns = lessonsByLevel.addResource("nouns");
    lessonsNouns.addMethod(
      "GET",
      new apigateway.LambdaIntegration(lessonApiFn),
    );

    // GET /lessons/{level}/verbs
    const lessonsVerbs = lessonsByLevel.addResource("verbs");
    lessonsVerbs.addMethod(
      "GET",
      new apigateway.LambdaIntegration(lessonApiFn),
    );

    // GET /lessons/{level}/{lessonId}
    const lessonById = lessonsByLevel.addResource("{lessonId}");
    lessonById.addMethod("GET", new apigateway.LambdaIntegration(lessonApiFn));

    // GET /lessons/{level}/{lessonId}/summary
    const lessonSummary = lessonById.addResource("summary");
    lessonSummary.addMethod(
      "GET",
      new apigateway.LambdaIntegration(lessonApiFn),
    );

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "RawBucketName", { value: rawBucket.bucketName });
    new cdk.CfnOutput(this, "ProcessedBucketName", {
      value: processedBucket.bucketName,
    });
    new cdk.CfnOutput(this, "ExercisesTableName", {
      value: exercisesTable.tableName,
    });
    new cdk.CfnOutput(this, "ExercisesApiUrl", {
      value: `${api.url}exercises`,
      description: "Set this as VITE_EXERCISES_API_URL in Amplify Console",
    });
    new cdk.CfnOutput(this, "LessonsApiUrl", {
      value: `${api.url}lessons`,
      description: "Set this as VITE_LESSONS_API_URL in Amplify Console",
    });
  }
}
