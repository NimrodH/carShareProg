import os
import json
import boto3
import copy
import time
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError
from datetime import datetime # for serverMsgId

dynamodb = boto3.resource('dynamodb')
dynamodb_client = boto3.client('dynamodb')
TABLE_NAME = os.environ.get('CS_AVATARS_TABLE', 'cs_avatars')
table = dynamodb.Table(TABLE_NAME)
retry_table = dynamodb.Table('PendingRetries')
apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.getenv('API_GATEWAY_ENDPOINT'))

def lambda_handler(event, context):
    # TODO implement
    the_body = {}    
    my_connection_id = event['requestContext']['connectionId']
    the_body['action'] = 'avatarLeft'
    avatarId = connection2id(my_connection_id)
    print(f"avatarId: {avatarId}")
    #find the avatar id in table by its connection_id
    setDoneOnTable(avatarId, "status", "done")
    the_body['avatarID'] = avatarId
    send_to_other_clients(my_connection_id, the_body)

    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }

### msg_type:  multyClients, singleClient
def send2client(connection_id, the_body, msg_type = "singleClient"):
    # add serverMsgId. client will send it back to know we don't need to send again
    payload = copy.deepcopy(the_body)

    if payload["action"] != "message_done":
        server_msg_id = f"msg-{datetime.utcnow().timestamp()}"
        payload['serverMsgId'] = server_msg_id
    
    if connection_id:
        try:
            response = apigatewaymanagementapi.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(payload)
            )
            if payload["action"] != "message_done":
            # Save message into DynamoDB to await for client approval
                retry_table.put_item(
                    Item={
                        'connectionId': connection_id,
                        'messageId': server_msg_id,
                        "payload": payload,
                        'retryCount': 0,
                        'timestamp': datetime.utcnow().isoformat()
                    }
                )

                events = boto3.client('events')
                EVENTBRIDGE_RULE_NAME = 'RetryEveryMinute'
                try:
                    events.enable_rule(
                        Name=EVENTBRIDGE_RULE_NAME
                    )
                    #print(f"Enabled EventBridge rule {EVENTBRIDGE_RULE_NAME}")
                except Exception as e:
                    print(f"Failed to enable EventBridge rule: {str(e)}")

            return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}
        except ClientError as error:
            #print('Error sending message: %s', error)
            # Still save it for retry
            if payload["action"] != "message_done":
                retry_table.put_item(
                    Item={
                        'connectionId': connection_id,
                        'messageId': server_msg_id,
                        "payload": payload,
                        'retryCount': 0,
                        "timestamp": datetime.utcnow().isoformat()
                    }
                )
            if msg_type == "multyClients":
                raise  # allow to the calling function send2client to continue with other avatars
 
            return {'statusCode': 500, 'body': json.dumps({'message': 'Failed to send message'})}
        
def send_to_other_clients(my_connection_id, the_body):  
    #print("send_to_other_clients--> the_body") 
    #print(the_body) 
    response = dynamodb_client.scan(TableName=TABLE_NAME)
    for item in response['Items']:
        connection_id = item['connectionId']['S']
        if connection_id != my_connection_id:
            try:
                send2client(connection_id, the_body, "multyClients")
            except ClientError as error:
                print('Error sending message: %s', error)
                continue
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}

def connection2id(connection_id):
    try:
        # ==== OPTION A: Scan for connectionId (no GSI required) ====
        response = table.scan(
            FilterExpression=Attr('connectionId').eq(connection_id),
            ProjectionExpression='avatarID'
        )
        items = response.get('Items', [])

        if not items:
            return {
                'statusCode': 404,
                'body': json.dumps({'message': f'No avatar found for connectionId {connection_id}'})
            }

        # Assuming one-to-one mapping, take the first match
        avatar_id = items[0]['avatarID']
        return avatar_id
#        return {
#            'statusCode': 200,
#            'body': json.dumps({'avatarID': avatar_id})
#        }

    except Exception as e:
        print(f"Error fetching avatarID for connectionId={connection_id}: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Internal server error'})
        }

def setDoneOnTable(key, attr, new_value): 
    try:
        table.update_item(
            Key={'avatarID': key},
            UpdateExpression="SET #attr = :val",
            ExpressionAttributeNames={"#attr": attr},
            ExpressionAttributeValues={":val": new_value}
        )
        print(f"Avatar status updated to {new_value}")
    except Exception as error:
        print(f"Error updating avatar status: {error}")
