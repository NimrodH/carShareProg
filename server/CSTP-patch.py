import json, os, boto3, base64, time
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
SIGNS_TABLE = os.environ.get("SIGNS_TABLE", "cs_signs")
AVATARS_TABLE = os.environ.get("AVATARS_TABLE", "cs_avatars")
signs = dynamodb.Table(SIGNS_TABLE)
avatars = dynamodb.Table(AVATARS_TABLE)

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "https://nimrodh.github.io")
COMMON_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "PATCH,OPTIONS"
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
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "PATCH")
    if method == "OPTIONS":
        return _resp(200, {"ok": True})
    avatar_id = (event.get("pathParameters") or {}).get("proxy") or (event.get("pathParameters") or {}).get("avatarID")
    if not avatar_id:
        return _resp(400, {"error": "avatarID path parameter missing"})
    body = _parse_body(event)
    field = body.get("field")
    value = body.get("value")
    if not field:
        return _resp(400, {"error": "field is required"})

    table = signs if field == "isLoading" else avatars
    update_expr = "SET #f = :v, updatedAt = :u"
    expr_names = {"#f": field}
    expr_vals = {":v": value, ":u": int(time.time()*1000)}

    try:
        resp = table.update_item(
            Key={"avatarID": avatar_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_vals,
            ReturnValues="ALL_NEW"
        )
        return _resp(200, {"message": "Avatar updated successfully", "updated": resp.get("Attributes")})
    except ClientError as e:
        return _resp(500, {"error": e.response['Error']['Message']})
