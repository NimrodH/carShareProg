import json
import os
import time
import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timezone
from urllib.parse import parse_qs

# ---------- Infra & globals ----------

dynamodb = boto3.resource("dynamodb")
ddb_client = boto3.client("dynamodb")

APIGW_MGMT = boto3.client(
    "apigatewaymanagementapi",
    endpoint_url=os.getenv("API_GATEWAY_ENDPOINT")
)

AVATARS_TABLE_NAME = os.environ["AVATARS_TABLE_NAME"]
CHATS_TABLE_NAME   = os.environ["CHATS_TABLE_NAME"]

AVATARS = dynamodb.Table(AVATARS_TABLE_NAME)
CHATS   = dynamodb.Table(CHATS_TABLE_NAME)
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "https://nimrodh.github.io")

COMMON_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

def _resp(code, payload):
    return {"statusCode": code, "headers": COMMON_HEADERS, "body": json.dumps(payload)}

def _now_ms():
    return int(time.time() * 1000)

def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

def _gen_chat_id(a, b):
    lo, hi = sorted([a, b])
    return f"{lo}__{hi}__{_now_iso()}"

# If you maintain a map of avatarID -> connection IDs in DynamoDB,
# implement this lookup. For now it returns [] to make WS nudges optional.
def _get_connection_ids_for_avatars(avatar_ids):
    # TODO: integrate with your connections mapping table if you have one.
    return []

def _best_effort_ws_nudge(message, connection_ids):
    for cid in connection_ids:
        try:
            APIGW_MGMT.post_to_connection(ConnectionId=cid, Data=json.dumps(message).encode("utf-8"))
        except Exception:
            # Ignore; HTTP remains the source of truth
            pass

# ---------- New: /V1/chat/start ----------

def handle_chat_start(event):
    """
    POST /V1/chat/start
    Body: { "fromAvatarID": "...", "toAvatarID": "...", "messageId": "uuid-optional" }
    Success: 200 { ok:true, chatID, fromAvatarID, toAvatarID, [idempotent] }
    Errors:  409 callerBusy | 409 calleeBusy | 409 selfChat | 404 avatarNotFound | 409 conflict
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

# ---------- Existing HTTP endpoints (typical implementations) ----------

def handle_chat_send_line(event):
    """
    POST /V1/chat/sendLine
    Body: { "chatID": "...", "fromAvatarID": "...", "newLine": "UserName: text ..." }
    Appends a single line to chatText.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "POST":
        return _resp(405, {"error": "methodNotAllowed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _resp(400, {"error": "badJson"})

    chat_id = body.get("chatID")
    new_line = body.get("newLine", "")
    if not chat_id or not isinstance(new_line, str) or not new_line.strip():
        return _resp(400, {"error": "missingParams", "need": ["chatID", "newLine"]})

    now_ms = _now_ms()

    # Read, append, write (keeps schema compatible if chatText is a string)
    try:
        item = CHATS.get_item(Key={"chatID": chat_id}).get("Item")
        if not item:
            return _resp(404, {"error": "chatNotFound"})
        current = item.get("chatText") or ""
        updated = (current + ("\n" if current else "") + new_line)
        CHATS.update_item(
            Key={"chatID": chat_id},
            UpdateExpression="SET chatText = :t, updatedAt = :u",
            ExpressionAttributeValues={":t": updated, ":u": now_ms},
            ReturnValues="UPDATED_NEW"
        )
    except ClientError as e:
        return _resp(500, {"error": "updateFailed", "details": str(e)})

    # Optional nudge to both participants
    participants = item.get("participants", [])
    ids = []
    for p in participants:
        if isinstance(p, dict) and "S" in p:
            ids.append(p["S"])
        elif isinstance(p, str):
            ids.append(p)
    _best_effort_ws_nudge(
        {"type": "nudge", "topic": "chat:line", "chatID": chat_id},
        _get_connection_ids_for_avatars(ids)
    )

    return _resp(200, {"ok": True, "chatID": chat_id})

def handle_chat_get_text(event):
    """
    GET /V1/chat/getText?chatID=...
    Returns: { chatID, chatText, updatedAt, startTime, endTime }
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "GET":
        return _resp(405, {"error": "methodNotAllowed"})

    # Support both HTTP API (rawQueryString) and REST API (queryStringParameters)
    qs = event.get("rawQueryString")
    if qs:
        params = parse_qs(qs)
        chat_id = (params.get("chatID") or [None])[0]
    else:
        params = event.get("queryStringParameters") or {}
        chat_id = params.get("chatID")

    if not chat_id:
        return _resp(400, {"error": "missingParams", "need": ["chatID"]})

    try:
        item = CHATS.get_item(Key={"chatID": chat_id}).get("Item")
        if not item:
            return _resp(404, {"error": "chatNotFound"})
        return _resp(200, {
            "chatID": item["chatID"],
            "chatText": item.get("chatText", ""),
            "updatedAt": item.get("updatedAt"),
            "startTime": item.get("startTime"),
            "endTime": item.get("endTime")
        })
    except ClientError as e:
        return _resp(500, {"error": "readFailed", "details": str(e)})

def handle_chat_end(event):
    """
    POST /V1/chat/end
    Body: { "chatID": "...", "fromAvatarID": "...", "toAvatarID": "..." }
    Sets endTime and (optionally) frees both avatars back to noChat.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")
    if method != "POST":
        return _resp(405, {"error": "methodNotAllowed"})

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return _resp(400, {"error": "badJson"})

    chat_id = body.get("chatID")
    from_id = body.get("fromAvatarID")
    to_id   = body.get("toAvatarID")
    if not chat_id or not from_id or not to_id:
        return _resp(400, {"error": "missingParams", "need": ["chatID", "fromAvatarID", "toAvatarID"]})

    now_ms = _now_ms()

    # End chat and free both avatars atomically (best-effort consistent)
    try:
        ddb_client.transact_write_items(
            TransactItems=[
                {
                    "Update": {
                        "TableName": CHATS_TABLE_NAME,
                        "Key": {"chatID": {"S": chat_id}},
                        "UpdateExpression": "SET endTime = :e, updatedAt = :u",
                        "ExpressionAttributeValues": {
                            ":e": {"N": str(now_ms)},
                            ":u": {"N": str(now_ms)},
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE",
                    }
                },
                {
                    "Update": {
                        "TableName": AVATARS_TABLE_NAME,
                        "Key": {"avatarID": {"S": from_id}},
                        "UpdateExpression": "SET #s=:no, partnerID=:z, chatID=:z, updatedAt=:u",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": {
                            ":no": {"S": "noChat"},
                            ":z":  {"NULL": True},
                            ":u":  {"N": str(now_ms)},
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE",
                    }
                },
                {
                    "Update": {
                        "TableName": AVATARS_TABLE_NAME,
                        "Key": {"avatarID": {"S": to_id}},
                        "UpdateExpression": "SET #s=:no, partnerID=:z, chatID=:z, updatedAt=:u",
                        "ExpressionAttributeNames": {"#s": "status"},
                        "ExpressionAttributeValues": {
                            ":no": {"S": "noChat"},
                            ":z":  {"NULL": True},
                            ":u":  {"N": str(now_ms)},
                        },
                        "ReturnValuesOnConditionCheckFailure": "NONE",
                    }
                }
            ]
        )
    except ClientError as e:
        return _resp(500, {"error": "transactFailed", "details": str(e)})

    # WS nudge (optional)
    _best_effort_ws_nudge(
        {"type": "nudge", "topic": "chat:end", "chatID": chat_id},
        _get_connection_ids_for_avatars([from_id, to_id])
    )

    return _resp(200, {"ok": True, "chatID": chat_id})

# ---------- Router ----------

def lambda_handler(event, context):
    """
    Routes:
      POST /V1/chat/start     -> handle_chat_start   (NEW)
      POST /V1/chat/sendLine  -> handle_chat_send_line
      GET  /V1/chat/getText   -> handle_chat_get_text
      POST /V1/chat/end       -> handle_chat_end
    """
    path   = event.get("rawPath") or event.get("path") or ""
    method = event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod")

    # Normalize path (strip trailing slash)
    if path.endswith("/") and path != "/":
        path = path[:-1]

    if path == "/V1/chat/start" and method == "POST":
        return handle_chat_start(event)

    if path == "/V1/chat/sendLine" and method == "POST":
        return handle_chat_send_line(event)

    if path == "/V1/chat/getText" and method == "GET":
        return handle_chat_get_text(event)

    if path == "/V1/chat/end" and method == "POST":
        return handle_chat_end(event)

    return _resp(404, {"error": "notFound", "path": path, "method": method})
