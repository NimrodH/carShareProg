import boto3
import json
import os
from datetime import datetime, timedelta

# Environment Variables
DYNAMODB_TABLE = os.environ.get('DYNAMODB_TABLE', 'PendingRetries')
WEBSOCKET_ENDPOINT = os.environ.get('API_GATEWAY_ENDPOINT')  # Example: "https://abc123.execute-api.us-east-1.amazonaws.com/production"

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(DYNAMODB_TABLE)
apigateway = boto3.client('apigatewaymanagementapi', endpoint_url=WEBSOCKET_ENDPOINT)
events = boto3.client('events')
MAX_TRY = 3

def lambda_handler(event, context):
    # 0. Query DynamoDB for pending retries
    response = table.scan()
    items = response.get('Items', [])

    for item in items:
        connection_id = item['connectionId']
        message_id = item['messageId']
        #payload = item['payload']
        #retry_count = item.get('retryCount', 0)
        # 1. Strong-consistent read to verify the item still exists
        verification = table.get_item(
            Key={
                'connectionId': connection_id,
                'messageId': message_id
            },
            ConsistentRead=True
        )

        if 'Item' not in verification:
            print(f"Skipped retry for {message_id}: item no longer exists.")
            continue  # Item was deleted between scan and now

        # Safely use verified item
        payload = verification['Item']['payload']
        retry_count = verification['Item'].get('retryCount', 0)

        try:
            # 2. Attempt to send the message again
            apigateway.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(payload)
            )
            print(f"Retry sent successfully and deleted for {message_id} to {connection_id}")
            print(payload)

            # 3. Delete from pending if successful
            if retry_count >= MAX_TRY:
                print(f"Max retries reached for {message_id}. Deleting.")
                table.delete_item(
                    Key={
                        'connectionId': connection_id,
                        'messageId': message_id
                    }
                )
            else:
                # Increment retry count
                table.update_item(
                    Key={
                        'connectionId': connection_id,
                        'messageId': message_id
                    },
                    UpdateExpression="SET retryCount = :val",
                    ExpressionAttributeValues={
                        ':val': retry_count + 1
                    }
                )
 
        except apigateway.exceptions.GoneException:
            print(f"Connection {connection_id} is gone. Cleaning up.")
            table.delete_item(
                Key={
                    'connectionId': connection_id,
                    'messageId': message_id
                }
            )
        except Exception as e:
            print(f"Error retrying {message_id}: {str(e)}")
            # Optionally increment retry counter or set a "lastTried" timestamp
            table.update_item(
                Key={
                    'connectionId': connection_id,
                    'messageId': message_id
                },
                UpdateExpression="SET retryCount = :val",
                ExpressionAttributeValues={
                    ':val': retry_count + 1
                }
            )
    disable_retry_rule_if_no_pending()
    return {
        'statusCode': 200,
        'body': json.dumps(f"Processed {len(items)} retries.")
    }

def disable_retry_rule_if_no_pending():
    response = table.scan(Limit=1)  # just check if at least 1 exists
    if not response.get('Items'):
        try:
            events.disable_rule(
                Name=os.environ.get('RETRY_RULE_NAME', 'RetryEveryMinute')
            )
            print("No pending retries left. Disabled EventBridge rule.")
        except Exception as e:
            print(f"Failed to disable EventBridge rule: {str(e)}")

