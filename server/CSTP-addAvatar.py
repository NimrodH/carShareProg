
import json, os, boto3, base64, time
from botocore.exceptions import ClientError

dynamodb = boto3.resource("dynamodb")
SIGNS_TABLE = os.environ.get("SIGNS_TABLE", "cs_signs")
AVATARS_TABLE = os.environ.get("AVATARS_TABLE", "cs_avatars")
signs = dynamodb.Table(SIGNS_TABLE)
avatars = dynamodb.Table(AVATARS_TABLE)

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "https://nimrodh.github.io")
COMMON_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "OPTIONS,POST"
}

def _parse_body(event):
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")
    try:
        return json.loads(body)
    except Exception:
        return {}

def _resp(code, payload):
    return {"statusCode": code, "headers": COMMON_HEADERS, "body": json.dumps(payload)}

def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "POST")
    if method == "OPTIONS":
        return _resp(200, {"ok": True})
    if method != "POST":
        return _resp(405, {"error": "Method not allowed"})

    payload = _parse_body(event)
    # Required
    avatar_id = payload.get("avatarID")
    if not avatar_id:
        return _resp(400, {"error": "avatarID is required"})

    # Defaults
    is_loading = bool(payload.get("isLoading", True))
    is_man = bool(payload.get("isMan", True))
    user_name = payload.get("userNameFrom") or payload.get("userName") or "user"
    now = int(time.time()*1000)

    # Build items
    sign_item = {
        "avatarID": avatar_id,
        "userName": user_name,
        "isMan": is_man,
        "isLoading": is_loading,
        "createdAt": now,
        "updatedAt": now
    }
    # include any other provided fields
    for k, v in payload.items():
        if k not in sign_item:
            sign_item[k] = v

    avatar_item = {
        "avatarID": avatar_id,
        "status": "loading" if is_loading else "noChat",
        "updatedAt": now
    }

    try:
        # Write both tables; prefer idempotency (no overwrite of newer records)
        avatars.put_item(Item=avatar_item)
        signs.put_item(Item=sign_item)
    except ClientError as e:
        return _resp(500, {"error": f"DynamoDB error: {e.response['Error']['Message']}"})

    return _resp(201, {"message": "Avatar created", "avatarID": avatar_id})
