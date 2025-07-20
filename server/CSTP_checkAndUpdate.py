import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('TABLE_NAME', 'cs_avatars'))
myHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://nimrodh.github.io",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
}
def lambda_handler(event, context):
    print("checkAndUpadate")
    body = json.loads(event['body'])
    key = body['key']
    attr = body['checkAttribute']
    required = body['requiredValue']
    new_value = body['newValue']

    # Fetch the item
    try:
        response = table.get_item(Key={'avatarID': key})
        item = response.get('Item')
    except Exception as e:
        return {'statusCode': 500, "headers": myHeaders, 'body': json.dumps({'error': str(e)})}

    if not item:
        return {'statusCode': 200, "headers": myHeaders, 'body': json.dumps({'message': 'not found'})}

    current_value = item.get(attr)
    if current_value != "noChat":
        return {'statusCode': 200, "headers": myHeaders, 'body': json.dumps({'message': 'refused'})}
    else: #noChat
        try:
            table.update_item(
                Key={'avatarID': key},
                UpdateExpression="SET #attr = :val",
                ExpressionAttributeNames={"#attr": attr},
                ExpressionAttributeValues={":val": new_value}
            )
            return {'statusCode': 200, "headers": myHeaders, 'body': json.dumps({'message': 'success'})}
        except Exception as e:
            return {'statusCode': 500, "headers": myHeaders, 'body': json.dumps({'error': str(e)})}
