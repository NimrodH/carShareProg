import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
myHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://nimrodh.github.io",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "POST,OPTIONS,GET"
}
signsTable = dynamodb.Table(os.environ.get('SESSIONS_TABLE', 'cs_signs'))
avatarsTable = dynamodb.Table(os.environ.get('SESSIONS_TABLE', 'cs_avatars'))
def lambda_handler(event, context):
    try:
        response = signsTable.scan()
        signItems = response.get('Items', [])
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': myHeaders,
            'body': json.dumps({"error": str(e)})
        }

    try:
        response = avatarsTable.scan()
        avatarItems = response.get('Items', [])
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': myHeaders,
            'body': json.dumps({"error": str(e)})
        }

    return {
        'statusCode': 200,
        'headers': myHeaders,
        'body': json.dumps({
            "signs": signItems,
            "avatars": avatarItems
        })
    }
