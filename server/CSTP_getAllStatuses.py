import json, boto3, os
import time
from decimal import Decimal
from botocore.exceptions import ClientError

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
        # Full scans (kept for compatibility; you can move to keys + GSI later if needed)
        signItems   = signsTable.scan().get('Items', [])
        avatarItems = avatarsTable.scan().get('Items', [])

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

        # ---------- NEW: normalize/extend avatars with required fields ----------
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
            # e.g., position, color, metadata… copy-through if present.
            # This keeps backward compatibility while ensuring new fields exist.
            passthrough_keys = ["color", "posX", "posY", "posZ", "role", "extra"]
            for k in passthrough_keys:
                if k in it:
                    out[k] = it[k]

            avatars_out.append(out)

        # You can also normalize signs minimally if you prefer (kept raw for now)
        # but make sure critical fields are present in your UI path.
        # signItems = [{... normalize if needed ...} for s in signItems]

        # Return with CORS (so browser fetches don’t get blocked)
        return _resp(200, {"signs": signItems, "avatars": avatars_out}, with_cors=True)

    except ClientError as e:
        return _resp(500, {"error": "dynamodbError", "details": str(e)}, with_cors=True)
    except Exception as e:
        return _resp(500, {"error": str(e)}, with_cors=True)
