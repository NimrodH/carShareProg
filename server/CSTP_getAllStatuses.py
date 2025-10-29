
import json, boto3, os
import time
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            # Convert Decimal to int if no fraction, else to float
            if obj % 1 == 0:
                return int(obj)
            else:
                return float(obj)
        return super(DecimalEncoder, self).default(obj)

dynamodb = boto3.resource('dynamodb')

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "https://nimrodh.github.io")


SIGNS_TABLE = os.environ.get('SIGNS_TABLE', 'cs_signs')
AVATARS_TABLE = os.environ.get('AVATARS_TABLE', 'cs_avatars')
signsTable = dynamodb.Table(SIGNS_TABLE)
avatarsTable = dynamodb.Table(AVATARS_TABLE)

def _resp(status, payload, with_cors=False):
    headers = {"Content-Type": "application/json"}
    if with_cors:
        headers.update({
            "Access-Control-Allow-Origin": "https://nimrodh.github.io",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
            "Access-Control-Allow-Methods": "GET,OPTIONS"
        })
    return {
        "statusCode": status,
        "headers": headers,
        "body": json.dumps(payload, cls=DecimalEncoder)
    }

def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}) or {}).get("method", "GET")
    if method == "OPTIONS":
        return _resp(200, {"ok": True})
    try:
        signItems = signsTable.scan().get('Items', [])
        avatarItems = avatarsTable.scan().get('Items', [])

        # 🚧 Filter out stale "loading" items (ghosts)
        now_ms = int(time.time() * 1000)
        FRESH_MS = 2 * 60 * 1000  # 2 minutes grace for a loader to become ready

        def fresh_sign(item):
            # Keep if not loading, OR loading but recently updated
            updated = int(item.get("updatedAt", 0)) if str(item.get("updatedAt", "0")).isdigit() else 0
            return (not item.get("isLoading")) or (updated >= now_ms - FRESH_MS)

        def fresh_avatar(item):
            # Keep if status != "loading", OR loading but recently updated
            updated = int(item.get("updatedAt", 0)) if str(item.get("updatedAt", "0")).isdigit() else 0
            status = item.get("status")
            return (status != "loading") or (updated >= now_ms - FRESH_MS)

        signItems = [it for it in signItems if fresh_sign(it)]
        avatarItems = [it for it in avatarItems if fresh_avatar(it)]

        
        return _resp(200, {"signs": signItems, "avatars": avatarItems})
    except Exception as e:
        return _resp(500, {"error": str(e)})
