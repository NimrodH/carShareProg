import json, boto3, os
import time
from decimal import Decimal
from botocore.exceptions import ClientError
from urllib.parse import parse_qs  # NEW: for query string parsing

# ---------- JSON encoder that handles Decimal cleanly ----------
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert Decimal to int if no fraction, else to float
            if obj % 1 == 0:
                return int(obj)
            else:
                return float(obj)
        return super(DecimalEncoder, self).default(obj)

# ---------- AWS resources / tables ----------
dynamodb = boto3.resource('dynamodb')

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "https://nimrodh.github.io")

SIGNS_TABLE   = os.environ.get('SIGNS_TABLE',   'cs_signs')
AVATARS_TABLE = os.environ.get('AVATARS_TABLE', 'cs_avatars')

signsTable   = dynamodb.Table(SIGNS_TABLE)
avatarsTable = dynamodb.Table(AVATARS_TABLE)

# ---------- Response helper ----------
def _resp(status, payload, with_cors=False):
    headers = {"Content-Type": "application/json"}
    if with_cors:
        headers.update({
            "Access-Control-Allow-Origin": CORS_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
        })
    return {
        "statusCode": status,
        "headers": headers,
        "body": json.dumps(payload, cls=DecimalEncoder)
    }

# ---------- Type helpers ----------
def _to_int(val, default=0):
    try:
        # handle Decimal / str / int
        if isinstance(val, Decimal):
            return int(val)
        if isinstance(val, (int,)):
            return val
        if isinstance(val, str) and val.isdigit():
            return int(val)
        # Sometimes updatedAt may come as float-like string; try best-effort
        return int(float(val))
    except Exception:
        return default

# ---------- Lambda handler ----------
def lambda_handler(event, context):
    # Handle CORS preflight
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "GET")
    if method == "OPTIONS":
        return _resp(200, {"ok": True}, with_cors=True)

    try:
        now_ms   = int(time.time() * 1000)
        STALE_MS = 2 * 60 * 1000  # 2 minutes

        # --- NEW: optional heartbeat - avatarID from query string ---
        raw_qs = event.get("rawQueryString") or ""
        qs = parse_qs(raw_qs) if raw_qs else {}
        # Fallback for REST API style event
        if not qs and event.get("queryStringParameters"):
            qs = {
                k: [v]
                for k, v in event["queryStringParameters"].items()
                if v is not None
            }

        avatar_id = (qs.get("avatarID") or [None])[0]

        if avatar_id:
            try:
                # Record the last time this avatar called getAllStatuses (periodicUpdate / chat poll)
                avatarsTable.update_item(
                    Key={"avatarID": avatar_id},
                    UpdateExpression="SET lastPeriodicUpdateAt = :now",
                    ExpressionAttributeValues={":now": now_ms}
                )
            except ClientError as e:
                # Best-effort only; don't break the main flow
                print(f"heartbeat update failed for {avatar_id}: {e}")

        # Full scans (kept for compatibility; you can move to keys + GSI later if needed)
        signItems   = signsTable.scan().get('Items', [])
        avatarItems = avatarsTable.scan().get('Items', [])

        # --- NEW: mark stale avatars as 'done' when gap > 2 minutes ---
        # IMPORTANT: only avatars that have sent at least one heartbeat
        # (i.e., have lastPeriodicUpdateAt) are considered here.
        for it in avatarItems:
            try:
                aid = it.get("avatarID")
                if not aid:
                    continue

                status = it.get("status")
                if status == "done":
                    continue  # already done, no need to touch

                # Only use lastPeriodicUpdateAt for stale detection.
                # If there was no heartbeat yet, SKIP this avatar.
                last_seen = it.get("lastPeriodicUpdateAt")
                if last_seen is None:
                    continue  # no periodicUpdate/chat poll yet → don't mark done

                last_seen_int = _to_int(last_seen, 0)
                if not last_seen_int:
                    continue

                if (now_ms - last_seen_int) > STALE_MS:
                    # Mark as done once
                    avatarsTable.update_item(
                        Key={"avatarID": aid},
                        UpdateExpression="SET #s = :done, updatedAt = :now",
                        ExpressionAttributeNames={"#s": "status"},
                        ExpressionAttributeValues={
                            ":done": "done",
                            ":now": now_ms
                        }
                    )
                    # Also reflect in the in-memory item so the response is consistent
                    it["status"]    = "done"
                    it["updatedAt"] = now_ms

            except ClientError as e:
                # Best-effort; don't fail the whole request
                print(f"stale check/update failed for {it.get('avatarID')}: {e}")

        # 🚧 Filter out stale "loading" items (ghosts)
        now_ms  = int(time.time() * 1000)
        FRESH_MS = 2 * 60 * 1000  # 2 minutes grace for a loader to become ready

        def fresh_sign(item):
            # Keep if not loading, OR loading but recently updated
            updated = _to_int(item.get("updatedAt", 0), 0)
            return (not item.get("isLoading")) or (updated >= now_ms - FRESH_MS)

        def fresh_avatar(item):
            # Keep if status != "loading", OR loading but recently updated
            updated = _to_int(item.get("updatedAt", 0), 0)
            status  = item.get("status")
            return (status != "loading") or (updated >= now_ms - FRESH_MS)

        signItems   = [it for it in signItems if fresh_sign(it)]
        avatarItems = [it for it in avatarItems if fresh_avatar(it)]

        # ---------- normalize/extend avatars with required fields ----------
        avatars_out = []
        for it in avatarItems:
            # Required keys for the polling client (HTTP-only flow)
            out = {
                "avatarID": it.get("avatarID"),
                # keep your existing naming if you have a canonical name field:
                "userName": it.get("userName") or it.get("name") or it.get("displayName"),
                "status": it.get("status", "loading"),
                "partnerID": it.get("partnerID", None),
                "chatID": it.get("chatID", None),
                "updatedAt": _to_int(it.get("updatedAt", 0), 0),
            }

            # Preserve any other lightweight fields you already rely on (optional):
            passthrough_keys = ["color", "posX", "posY", "posZ", "role", "extra"]
            for k in passthrough_keys:
                if k in it:
                    out[k] = it[k]

            avatars_out.append(out)

        # Return with CORS (so browser fetches don’t get blocked)
        return _resp(200, {"signs": signItems, "avatars": avatars_out}, with_cors=True)

    except ClientError as e:
        return _resp(500, {"error": "dynamodbError", "details": str(e)}, with_cors=True)
    except Exception as e:
        return _resp(500, {"error": str(e)}, with_cors=True)
