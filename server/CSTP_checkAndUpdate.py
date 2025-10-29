import json
import os
import time
import boto3
from decimal import Decimal
from botocore.exceptions import ClientError

# ---------- Config ----------
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
AVATARS_TABLE_NAME = os.environ.get("AVATARS_TABLE_NAME", "cs_avatars")  # default

dynamodb = boto3.resource("dynamodb")
AVATARS = dynamodb.Table(AVATARS_TABLE_NAME)

# ---------- JSON encoder (Decimal-safe) ----------
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Cast to int if integral, else float
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)

# ---------- Helpers ----------
COMMON_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

def _resp(code, payload):
    return {
        "statusCode": code,
        "headers": COMMON_HEADERS,
        "body": json.dumps(payload, cls=DecimalEncoder),
    }

def _now_ms() -> int:
    return int(time.time() * 1000)

def _to_table(name: str):
    # If you later want to allow multiple tables, add a safe allow-list here.
    if name and name != AVATARS_TABLE_NAME:
        # Optional: allow only a known set; for now block unknowns for safety.
        raise ValueError("unsupportedTable")
    return AVATARS

# ---------- Lambda ----------
def lambda_handler(event, context):
    # CORS preflight
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method") or event.get("httpMethod")
    if method == "OPTIONS":
        return _resp(200, {"ok": True})

    if method != "POST":
        return _resp(405, {"error": "methodNotAllowed"})

    # Parse body
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _resp(400, {"error": "badJson"})

    # Params
    table_name     = body.get("tableName")         # optional; defaults to AVATARS_TABLE_NAME
    avatar_id      = body.get("avatarID")
    attr           = body.get("attr")
    required_value = body.get("requiredValue")
    new_value      = body.get("newValue")

    # Validate
    missing = []
    if not avatar_id:      missing.append("avatarID")
    if attr is None:       missing.append("attr")
    if required_value is None: missing.append("requiredValue")
    if new_value is None:  missing.append("newValue")

    if missing:
        return _resp(400, {"error": "missingParams", "need": missing})

    # Resolve table
    try:
        table = _to_table(table_name or AVATARS_TABLE_NAME)
    except ValueError:
        return _resp(400, {"error": "invalidTable", "tableName": table_name})

    # Read current item
    try:
        res = table.get_item(Key={"avatarID": avatar_id})
        item = res.get("Item")
        if not item:
            return _resp(404, {"error": "avatarNotFound", "avatarID": avatar_id})
    except ClientError as e:
        return _resp(500, {"error": "readFailed", "details": str(e)})

    # Short-circuit idempotency: already equals target?
    current_value = item.get(attr)
    if current_value == new_value:
        return _resp(200, {
            "ok": True,
            "idempotent": True,
            "avatarID": avatar_id,
            "attr": attr,
            "value": new_value
        })

    # Precondition check (compare-and-swap)
    if current_value != required_value:
        return _resp(409, {
            "error": "preconditionFailed",
            "attr": attr,
            "have": current_value,
            "need": required_value
        })

    # Conditional update: attr must still equal required_value
    now_ms = _now_ms()
    expr_names = {"#a": attr, "#u": "updatedAt"}
    expr_vals  = {
        ":new": new_value if new_value is not None else None,
        ":need": required_value if required_value is not None else None,
        ":u": now_ms
    }

    # Build expression parts (handle null safely)
    # When setting to NULL, we must use REMOVE or :new as NULL; here we use SET with :new as NULL.
    update_expr = "SET #a = :new, #u = :u"
    cond_expr   = "#a = :need"

    try:
        table.update_item(
            Key={"avatarID": avatar_id},
            UpdateExpression=update_expr,
            ConditionExpression=cond_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=_marshall_expr_vals(expr_vals),
            ReturnValues="ALL_NEW"
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("ConditionalCheckFailedException", "TransactionCanceledException"):
            # Lost the race: report clean 409
            # Optional: re-read for a nicer 'have'
            try:
                after = table.get_item(Key={"avatarID": avatar_id}).get("Item") or {}
                have_after = after.get(attr)
            except Exception:
                have_after = None
            return _resp(409, {
                "error": "preconditionFailed",
                "attr": attr,
                "have": have_after,
                "need": required_value
            })
        return _resp(500, {"error": "updateFailed", "details": str(e)})

    return _resp(200, {
        "ok": True,
        "avatarID": avatar_id,
        "attr": attr,
        "oldValue": current_value,
        "newValue": new_value,
        "updatedAt": now_ms
    })

# ---------- Helpers for ExpressionAttributeValues marshalling ----------
def _marshall_expr_vals(ev: dict):
    """
    boto3 Table.update_item in resource mode accepts Python types, EXCEPT when we use
    client-style low level. We're using resource mode, so we can pass Python values.
    But we assembled ev with :new possibly None; that's OK.
    Return ev without the colon keys? No—resource mode expects the dict with keys as in ExpressionAttributeValues.
    """
    # Resource mode wants raw Python values; ensure no Decimal sneaks in.
    out = {}
    for k, v in ev.items():
        if isinstance(v, Decimal):
            v = int(v) if v % 1 == 0 else float(v)
        out[k] = v
    return out
