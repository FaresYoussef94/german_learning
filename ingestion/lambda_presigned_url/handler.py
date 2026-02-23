"""Presigned URL API — generates time-limited S3 upload URLs for lesson PDFs."""

import json
import logging
import os

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

RAW_BUCKET = os.environ["RAW_BUCKET"]
API_KEY = os.environ.get("API_KEY", "")  # Set in CDK environment
UPLOAD_PASSWORD = os.environ.get("UPLOAD_PASSWORD", "")  # Set in CDK environment

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}


def respond(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, ensure_ascii=False),
    }


def main(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("httpMethod", "").upper()

    # Handle OPTIONS for CORS
    if http_method == "OPTIONS":
        return respond(200, {})

    if http_method != "POST":
        return respond(405, {"error": "method_not_allowed"})

    # Validate API Key
    if API_KEY:
        provided_api_key = event.get("headers", {}).get("x-api-key", "").strip()
        if provided_api_key != API_KEY:
            logger.warning("Invalid API key provided")
            return respond(401, {"error": "Invalid API key"})

    # Parse request body
    try:
        body = json.loads(event.get("body", "{}")) if event.get("body") else {}
    except json.JSONDecodeError:
        return respond(400, {"error": "invalid_json"})

    # Validate password
    if UPLOAD_PASSWORD:
        provided_password = body.get("password", "").strip()
        if provided_password != UPLOAD_PASSWORD:
            logger.warning("Invalid password provided")
            return respond(401, {"error": "Invalid password"})

    lesson_id = body.get("lessonId", "").strip()
    level = body.get("level", "a1").strip().lower()

    if not lesson_id:
        logger.warning("Request missing lessonId field")
        return respond(400, {"error": "lessonId field is required"})

    # Validate and format lesson ID (should be 2 digits)
    try:
        lesson_num = int(lesson_id)
        formatted_lesson_id = f"{lesson_num:02d}"
    except ValueError:
        logger.warning(f"Invalid lessonId format: {lesson_id}")
        return respond(400, {"error": "lessonId must be a number"})

    key = f"{level}/lesson_{formatted_lesson_id}.pdf"

    logger.info(f"Generating presigned URL for {key}")

    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": RAW_BUCKET,
                "Key": key,
                "ContentType": "application/pdf",
            },
            ExpiresIn=600,  # 10 minutes
        )

        logger.info(f"Presigned URL generated successfully for {key}")
        return respond(200, {"uploadUrl": url, "key": key, "expiresIn": 600})

    except Exception as e:
        logger.error(f"Failed to generate presigned URL: {e}")
        return respond(500, {"error": "failed_to_generate_url"})
