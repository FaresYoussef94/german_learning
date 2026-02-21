"""Workflow Trigger Lambda — triggered by S3 PutObject on raw source bucket.

Parses S3 event, extracts bucket and key, and starts the Step Functions workflow.
"""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sfn = boto3.client('stepfunctions')

STATE_MACHINE_ARN = os.environ['STATE_MACHINE_ARN']


def main(event, context):
    logger.info("Workflow trigger received: %s", json.dumps(event))

    # Extract bucket and key from S3 event
    try:
        bucket = event['Records'][0]['s3']['bucket']['name']
        key = event['Records'][0]['s3']['object']['key']
    except (KeyError, IndexError) as e:
        logger.error("Invalid S3 event structure: %s", e)
        raise

    logger.info(f"Triggering workflow for {key} from bucket {bucket}")

    try:
        # Start Step Functions execution
        execution_input = json.dumps({"bucket": bucket, "key": key})
        response = sfn.start_execution(
            stateMachineArn=STATE_MACHINE_ARN,
            input=execution_input,
        )

        execution_arn = response['executionArn']
        logger.info(f"Started execution: {execution_arn}")

        return {
            'statusCode': 200,
            'body': json.dumps({'executionArn': execution_arn}),
        }

    except Exception as e:
        logger.error(f"Failed to start execution: {e}", exc_info=True)
        raise
