# use cs_sign table for isLoading and csAvatars for other fields i.e. status
import json
import os
import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
SIGNS_TABLE_NAME = os.environ.get("AVATARS_TABLE", "cs_signs")
AVATARS_TABLE_NAME = os.environ.get("AVATARS_TABLE", "cs_avatars")
#table will be set in if following the field value (we assume no isLoading field in cs_avatars)

myHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://nimrodh.github.io",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "PATCH,OPTIONS"
}

def lambda_handler(event, context):
    print("🔧 Received event:", json.dumps(event))

    # 1. Extract path parameter (avatarID)
    avatar_id = event.get("pathParameters", {}).get("avatarID")
    if not avatar_id:
        print("❌ Missing avatarID in path.")
        return {
            "statusCode": 400,
            "headers": myHeaders,
            "body": json.dumps({"error": "Missing 'avatarID' in path."})
        }

    # 2. Parse and validate body
    body_raw = event.get("body")
    if not body_raw:
        print("❌ Empty request body.")
        return {
            "statusCode": 400,
            "headers": myHeaders,
            "body": json.dumps({"error": "Empty request body"})
        }

    try:
        payload = json.loads(body_raw)
    except json.JSONDecodeError:
        print("❌ Invalid JSON format.")
        return {
            "statusCode": 400,
            "headers": myHeaders,
            "body": json.dumps({"error": "Invalid JSON"})
        }

    field = payload.get("field")
    value = payload.get("value")
    if field == "isLoading":
        table = dynamodb.Table(SIGNS_TABLE_NAME)
    else:
        table = dynamodb.Table(AVATARS_TABLE_NAME)

    if not field or value is None:
        print("❌ Missing 'field' or 'value' in payload.")
        return {
            "statusCode": 400,
            "headers": myHeaders,
            "body": json.dumps({"error": "Missing 'field' or 'value' in payload"})
        }

    print(f"🔁 Request to update avatarID='{avatar_id}' set '{field}' = '{value}'")

    # 3. Attempt update
    try:
        response = table.update_item(
            Key={'avatarID': avatar_id},
            UpdateExpression=f"SET #attr = :val",
            ExpressionAttributeNames={'#attr': field},
            ExpressionAttributeValues={':val': value},
            ConditionExpression="attribute_exists(avatarID)",  # Fail if the avatar doesn't exist
            ReturnValues="UPDATED_NEW"
        )
    except ClientError as e:
        if e.response['Error']['Code'] == "ConditionalCheckFailedException":
            print(f"❌ Avatar with ID '{avatar_id}' not found.")
            return {
                "statusCode": 404,
                "headers": myHeaders,
                "body": json.dumps({"error": f"Avatar '{avatar_id}' not found"})
            }
        else:
            print(f"❌ DynamoDB error: {e}")
            return {
                "statusCode": 500,
                "headers": myHeaders,
                "body": json.dumps({"error": f"DynamoDB error: {e.response['Error']['Message']}"} )
            }

    print(f"✅ Updated avatar {avatar_id}: {response.get('Attributes')}")
    return {
        "statusCode": 200,
        "headers": myHeaders,
        "body": json.dumps({
            "message": "Avatar updated successfully",
            "updated": response.get('Attributes')
        })
    }
