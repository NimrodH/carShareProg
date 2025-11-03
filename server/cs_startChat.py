import json
import os
import time
import boto3
from botocore.exceptions import ClientError
#from datetime import datetime, timezone
from urllib.parse import parse_qs

# ---------- Infra & globals ----------

dynamodb = boto3.resource("dynamodb")
ddb_client = boto3.client("dynamodb")

APIGW_MGMT = boto3.client(
    "apigatewaymanagementapi",
    endpoint_url=os.getenv("API_GATEWAY_ENDPOINT")
)

AVATARS_TABLE_NAME = os.getenv("AVATARS_TABLE", "cs_avatars")
CHATS_TABLE_NAME   = os.getenv("CHATS_TABLE",   "cs_chats")
#SIGNS_TABLE_NAME   = os.getenv("SIGNS_TABLE",   "cs_signs")

AVATARS = dynamodb.Table(AVATARS_TABLE_NAME)
CHATS   = dynamodb.Table(CHATS_TABLE_NAME)
#SIGNS   = dynamodb.Table(SIGNS_TABLE_NAME)

COMMON_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": os.getenv("CORS_ALLOW_ORIGIN", "*"),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
}

# ---------- Helpers ----------

def _resp(code, payload):
    return {"statusCode": code, "headers": COMMON_HEADERS, "body": json.dumps(payload)}

def _now_ms():
    return int(time.time() * 1000)

#def _now_iso():
#    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def _parse_body(event):
    b = event.get("body") or "{}"
    try:
        return json.loads(b)
    except Exception:
        try:
            # sometimes form-encoded
            return {k: v[0] for k, v in parse_qs(b).items()}
        except Exception:
            return {}

def _best_effort_ws_nudge(message_obj, connection_ids):
    # Optional nudge (no WS needed for HTTP flow)
    if not connection_ids:
        return
    data = json.dumps(message_obj).encode("utf-8")
    for cid in connection_ids:
        try:
            APIGW_MGMT.post_to_connection(ConnectionId=cid, Data=data)
        except Exception:
            pass

def _gen_chat_id(a, b):
    lo, hi = sorted([a, b])
    return f"{lo}_{hi}"

# If you maintain a map of avatarID -> connection IDs in DynamoDB,
# implement this lookup. For now it returns [] to make WS nudges optional.
def _get_connection_ids_for_avatars(avatar_ids):
    # TODO: integrate with your connections mapping table if you have one.
    return []

# ---------- HTTP router ----------

def lambda_handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method == "OPTIONS":
        return _resp(200, {"ok": True})

    raw_path = event.get("rawPath") or event.get("path") or ""
    path = raw_path  # already absolute like /V1/chat/start

    if path == "/V1/chat/start" and method == "POST":
        return handle_chat_start(event)

    if path == "/V1/chat/sendLine" and method == "POST":
        return handle_chat_send_line(event)

    if path == "/V1/chat/getText" and method == "GET":
        return handle_chat_get_text(event)

    if path == "/V1/chat/end" and method == "POST":
        return handle_chat_end(event)

    return _resp(404, {"error": "notFound", "path": path, "method": method})

# ---------- /V1/chat/start ----------

def handle_chat_start(event):
    """
    POST /V1/chat/start
    Body: { "fromAvatarID": "...", "toAvatarID": "...", "messageId": "uuid-optional" }
    Success: 200 { ok:true, chatID, fromAvatarID, toAvatarID, [idempotent] }
    Errors:  409 callerBusy | 409 calleeBusy | 409 selfChat | 404 avatarNotFound | 409 conflict | 409 pairNotAllowed
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "POST":
        return _resp(405, {"error": "methodNotAllowed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _resp(400, {"error": "badJson"})

    from_id   = body.get("fromAvatarID")
    to_id     = body.get("toAvatarID")
    message_id = body.get("messageId")  # optional, for idempotent caller retries logging

    if not from_id or not to_id:
        return _resp(400, {"error": "missingParams", "need": ["fromAvatarID", "toAvatarID"]})
    if from_id == to_id:
        return _resp(409, {"error": "selfChat"})

    # Read both avatars
    try:
        from_item = AVATARS.get_item(Key={"avatarID": from_id}).get("Item")
        to_item   = AVATARS.get_item(Key={"avatarID": to_id}).get("Item")
    except ClientError as e:
        return _resp(500, {"error": "readFailed", "details": str(e)})

    if not from_item or not to_item:
        missing = [k for k, v in {from_id: from_item, to_id: to_item}.items() if not v]
        return _resp(404, {"error": "avatarNotFound", "missing": missing})

    # Idempotency: already in a chat with each other?
    if (
        from_item.get("status") == "inChat" and
        to_item.get("status")   == "inChat" and
        from_item.get("partnerID") == to_id and
        to_item.get("partnerID")   == from_id and
        from_item.get("chatID") and from_item.get("chatID") == to_item.get("chatID")
    ):
        return _resp(200, {
            "ok": True,
            "chatID": from_item["chatID"],
            "fromAvatarID": from_id,
            "toAvatarID": to_id,
            "idempotent": True
        })

    # Preconditions
    if from_item.get("status") != "noChat":
        return _resp(409, {"error": "callerBusy"})
    if to_item.get("status") != "noChat":
        return _resp(409, {"error": "calleeBusy"})

    chat_id = _gen_chat_id(from_id, to_id)
    now_ms  = _now_ms()

    # Atomic: both avatars -> inChat; create chat row
    try:
        ddb_client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": AVATARS_TABLE_NAME,
                        "Key": {"avatarID": {"S": from_id}},
                        "UpdateExpression": "SET #s=:in, partnerID=:p, chatID=:c, updatedAt=:u",
                        "ConditionExpression": "#s = :no",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": {
                            ":no": {"S": "noChat"},
                            ":in": {"S": "inChat"},
                            ":p":  {"S": to_id},
                            ":c":  {"S": chat_id},
                            ":u":  {"N": str(now_ms)},
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE",
                    }
                },
                {
                    "Update": {
                        "TableName": AVATARS_TABLE_NAME,
                        "Key": {"avatarID": {"S": to_id}},
                        "UpdateExpression": "SET #s=:in, partnerID=:p, chatID=:c, updatedAt=:u",
                        "ConditionExpression": "#s = :no",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": {
                            ":no": {"S": "noChat"},
                            ":in": {"S": "inChat"},
                            ":p":  {"S": from_id},
                            ":c":  {"S": chat_id},
                            ":u":  {"N": str(now_ms)},
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE",
                    }
                },
                {
                    "Put": {
                        "TableName": CHATS_TABLE_NAME,
                        "Item": {
                            "chatID":       {"S": chat_id},
                            "participants": {"L": [{"S": from_id}, {"S": to_id}]},
                            "startTime":    {"N": str(now_ms)},
                            "endTime":      {"NULL": True},
                            "chatText":     {"S": ""},     # keep schema compatible with your UI
                            "updatedAt":    {"N": str(now_ms)}
                        },
                        "ConditionExpression": "attribute_not_exists(chatID)",
                        "ReturnValuesOnConditionCheckFailure": "NONE",
                    }
                }
            ]
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("ConditionalCheckFailedException", "TransactionCanceledException"):
            # If chat item already exists -> block second chat ever for this pair
            try:
                if CHATS.get_item(Key={"chatID": chat_id}).get("Item"):
                    return _resp(409, {"error": "pairNotAllowed"})
            except Exception:
                pass

            # Re-check who is busy to return a clearer error
            try:
                fi = AVATARS.get_item(Key={"avatarID": from_id}).get("Item") or {}
                ti = AVATARS.get_item(Key={"avatarID": to_id}).get("Item") or {}
                if fi.get("status") != "noChat":
                    return _resp(409, {"error": "callerBusy"})
                if ti.get("status") != "noChat":
                    return _resp(409, {"error": "calleeBusy"})
            except Exception:
                pass
            return _resp(409, {"error": "conflict"})
        return _resp(500, {"error": "transactFailed", "details": str(e)})

    # Optional: WS nudge (purely best-effort)
    _best_effort_ws_nudge(
        {"type": "nudge", "topic": "chat:start", "chatID": chat_id,
         "fromAvatarID": from_id, "toAvatarID": to_id},
        _get_connection_ids_for_avatars([from_id, to_id])
    )

    return _resp(200, {
        "ok": True,
        "chatID": chat_id,
        "fromAvatarID": from_id,
        "toAvatarID": to_id
    })

# ---------- /V1/chat/sendLine ----------

def handle_chat_send_line(event):
    """
    POST /V1/chat/sendLine
    Body: { "chatID": "...", "fromAvatarID": "...", "newLine": "UserName: text ..." }
    Appends a single line to chatText.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "POST":
        return _resp(405, {"error": "methodNotAllowed"})

    body = _parse_body(event)
    chat_id = body.get("chatID")
    from_id = body.get("fromAvatarID")
    new_line = body.get("newLine")

    if not chat_id or not from_id or new_line is None:
        return _resp(400, {"error": "missingParams", "need": ["chatID", "fromAvatarID", "newLine"]})

    now_ms = _now_ms()

    try:
        # Simple append model: read, append, write (can be refactored to conditional append if needed)
        item = CHATS.get_item(Key={"chatID": chat_id}).get("Item")
        if not item:
            return _resp(404, {"error": "chatNotFound", "chatID": chat_id})

        text = item.get("chatText") or ""
        if text and not text.endswith("\n"):
            text += "\n"
        text += new_line

        CHATS.update_item(
            Key={"chatID": chat_id},
            UpdateExpression="SET chatText=:t, updatedAt=:u",
            ExpressionAttributeValues={
                ":t": text,
                ":u": now_ms
            }
        )
        return _resp(200, {"ok": True, "chatText": text})
    except ClientError as e:
        return _resp(500, {"error": "updateFailed", "details": str(e)})

# ---------- /V1/chat/getText ----------

def handle_chat_get_text(event):
    """
    GET /V1/chat/getText?chatID=...
    Returns { chatText }
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "GET":
        return _resp(405, {"error": "methodNotAllowed"})

    query = event.get("rawQueryString") or ""
    if not query and "queryStringParameters" in event and event["queryStringParameters"]:
        # API GW v1
        chat_id = event["queryStringParameters"].get("chatID")
    else:
        params = parse_qs(query)
        chat_id = (params.get("chatID") or [None])[0]

    if not chat_id:
        return _resp(400, {"error": "missingParams", "need": ["chatID"]})

    try:
        item = CHATS.get_item(Key={"chatID": chat_id}).get("Item")
        if not item:
            return _resp(404, {"error": "chatNotFound", "chatID": chat_id})
        return _resp(200, {"chatText": item.get("chatText", "")})
    except ClientError as e:
        return _resp(500, {"error": "readFailed", "details": str(e)})

# ---------- /V1/chat/end ----------

def handle_chat_end(event):
    """
    POST /V1/chat/end
    Body: { "chatID": "...", "fromAvatarID": "...", "toAvatarID": "..." }
    Sets endTime and flips both avatars back to noChat.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "POST":
        return _resp(405, {"error": "methodNotAllowed"})

    body = _parse_body(event)
    chat_id = body.get("chatID")
    from_id = body.get("fromAvatarID")
    to_id   = body.get("toAvatarID")
    result  = body.get("dealResult")

    if not chat_id or not from_id or not to_id:
        return _resp(400, {"error": "missingParams", "need": ["chatID", "fromAvatarID", "toAvatarID"]})

    now_ms = _now_ms()

    # Flip both avatars atomically (best-effort consistent)
    try:
        ddb_client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": CHATS_TABLE_NAME,
                        "Key": {"chatID": {"S": chat_id}},
                        "UpdateExpression": "SET endTime = :e, updatedAt = :u, dealResult = :d",
                        "ExpressionAttributeValues": {
                            ":e": {"N": str(now_ms)},
                            ":u": {"N": str(now_ms)},
                            ":d": {"S": result},
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE"
                    }
                },
                {
                    "Update": {
                        "TableName": AVATARS_TABLE_NAME,
                        "Key": {"avatarID": {"S": from_id}},
                        "UpdateExpression": "SET #s=:no, partnerID=:nil, chatID=:nil, updatedAt=:u",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": {
                            ":no":  {"S": "noChat"},
                            ":nil": {"NULL": True},
                            ":u":   {"N": str(now_ms)}
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE"
                    }
                },
                {
                    "Update": {
                        "TableName": AVATARS_TABLE_NAME,
                        "Key": {"avatarID": {"S": to_id}},
                        "UpdateExpression": "SET #s=:no, partnerID=:nil, chatID=:nil, updatedAt=:u",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": {
                            ":no":  {"S": "noChat"},
                            ":nil": {"NULL": True},
                            ":u":   {"N": str(now_ms)}
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE"
                    }
                }
            ]
        )
    except ClientError as e:
        return _resp(500, {"error": "endTransactFailed", "details": str(e)})

    # Optional nudge
    _best_effort_ws_nudge(
        {"type": "nudge", "topic": "chat:end", "chatID": chat_id,
         "fromAvatarID": from_id, "toAvatarID": to_id},
        _get_connection_ids_for_avatars([from_id, to_id])
    )

    return _resp(200, {"ok": True, "chatID": chat_id})
