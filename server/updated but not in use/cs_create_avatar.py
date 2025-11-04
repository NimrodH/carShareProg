# will get the data that user entered in the welcomMessage and
# CREATE line for the avatar in the signs table
#  create the avatar in the avatars table
#  and will return the position and URL of the avatar to the user

import json
import time
import boto3
import os
import copy
from botocore.exceptions import ClientError
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
dynamodb_client = boto3.client('dynamodb')
avatars_table = dynamodb.Table(os.environ['AVATARS_TABLE_NAME'])
apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.getenv('API_GATEWAY_ENDPOINT'))
retry_table = dynamodb.Table('PendingRetries')

TTL_SECONDS = 5 * 60
MAX_RETRIES = 50
RETRY_DELAY = 2

_message_cache = {}

def _purge_expired():
    now = time.time()
    expired = [mid for mid, ts in _message_cache.items() if (now - ts) > TTL_SECONDS]
    for mid in expired:
        del _message_cache[mid]

def lambda_handler(event, context):
    _purge_expired()

    connection_id = event['requestContext']['connectionId']

    try:
        body = json.loads(event['body'])
    except Exception as e:
        print(f"❌ Failed to parse body: {e}")
        return {'statusCode': 400, 'body': json.dumps({'message': 'Invalid body'})}

    message_id = body.get("messageId")
    avatarID = body.get("avatarID")
    action_type = body.get("type")

    print(f"📥 Incoming message: avatarID={avatarID}, messageId={message_id}, type={action_type}")

    if message_id:
        if message_id in _message_cache:
            print(f"⚠️ Duplicate messageId detected (skipping): {message_id}")
            return {
                "statusCode": 200,
                "body": json.dumps({"ok": True, "note": "duplicate, ignored"})
            }
        _message_cache[message_id] = time.time()
        print(f"🆕 messageId added to cache: {message_id}")

    if action_type == "keepalive":
        #print("🔁 Keepalive received")
        return {'statusCode': 200, 'body': json.dumps('keepalive')}

    if action_type == "serverMsgDone":
        print(f"📩 serverMsgDone received")
        serverMsgId = body.get('serverMsgId')
        if serverMsgId:
            try:
                retry_table.delete_item(Key={'connectionId': connection_id, 'messageId': serverMsgId})
                print(f"✅ Deleted serverMsgId from retry_table: {serverMsgId}")
            except Exception as error:
                print(f"❌ Error deleting retry item: {error}")
        return {'statusCode': 200, 'body': json.dumps({'message': 'ACK processed'})}

    if action_type == "createAvatar":
        if avatarID is None:
            print("❌ 'avatarID' is missing from body")
            return {'statusCode': 400, 'body': json.dumps({'message': "'avatarID' key is missing in the body"})}

        print(f"🛠️ Creating avatar entry for {avatarID}")
        write_avatar(avatarID, connection_id)

        ack_message_done = {
            "action": "message_done",
            "responseTo": "createAvatar",
            "messageId": message_id
        }
        try:
            send2client(connection_id, ack_message_done)
            print(f"📤 Sent message_done for createAvatar to {connection_id}")
        except ClientError as error:
            print(f"❌ Error sending message_done: {error}")

        return {'statusCode': 200, 'body': json.dumps({'message': 'Avatar write initiated'})}
    if action_type == "setStatus":
        print(f"🛎️ setStatus received for avatarID={avatarID}")
        status = body.get("status")
        if not avatarID:
            print("❌ setStatus missing avatarID")
            return {'statusCode': 400, 'body': json.dumps({'message': 'Missing avatarID for setStatus'})}

        created_message = {"action": "setStatus", "avatarID": avatarID, "status": status}

        try:
            print("📣 Broadcasting setStatus to other clients...")
            send_to_other_clients(connection_id, created_message)
            print("✅ asetStatus broadcast completed.")
        except Exception as e:
            print(f"❌ Failed to send avatar_ready: {e}")
            return {'statusCode': 500, 'body': json.dumps({'message': 'Failed to broadcast setStatus'})}

        try:
            print(f"📝 Updating avatar status to 'noChat' for {avatarID}")
            update_avatar_status(avatarID, status)
            print(f"✅ Avatar {avatarID} status set to noChat")
            ack_message_done = {
                "action": "message_done",
                "responseTo": "setStatus",
                "messageId": message_id
            }
            send2client(connection_id, ack_message_done)
            print(f"📤 Sent message_done for setStatus to {connection_id}")
        except Exception as e:
            print(f"❌ Failed to update avatar status: {e}")
            return {'statusCode': 500, 'body': json.dumps({'message': 'Failed to update avatar status'})}

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'setStatus processed'})
        }
    print("⚠️ Unknown or unsupported action_type received: " + action_type)
    return {'statusCode': 400, 'body': json.dumps({'message': 'Invalid or missing type'})}

### update status of avatarID in table avatars_table.name
def  update_avatar_status(avatarID, status):
    try:
        avatars_table.update_item(
            Key={'avatarID': avatarID},
            UpdateExpression='SET #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': status}
        )
        print(f"Avatar status updated to {status}")
    except Exception as error:
        print(f"Error updating avatar status: {error}")


    ### create line for the avatar in the avatars table. set its initial ststus to loading
def write_avatar(avatarID, connection_id):
    print(f"✍️ write_avatar called with avatarID={avatarID}, connection_id={connection_id}")
    avatar_params = {
        'avatarID': avatarID,
        'isTalking': False,
        'status': 'loading',
        'connectionId': connection_id,
    }

    try:
        response = avatars_table.put_item(Item=avatar_params)
        print(f"✅ Avatar {avatarID} written to DynamoDB. Response: {response}")
    except Exception as error:
        print(f"❌ Error writing avatar {avatarID}: {error}")


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
    response = dynamodb_client.scan(TableName=os.environ['AVATARS_TABLE_NAME'])
    for item in response['Items']:
        connection_id = item['connectionId']['S']
        if connection_id != my_connection_id:
            try:
                send2client(connection_id, the_body, "multyClients")
            except ClientError as error:
                print('Error sending message: %s', error)
                continue
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}

def extract_values(item):
    extracted = {}
    for key, value in item.items():
        if 'S' in value:
            extracted[key] = value['S']
        elif 'N' in value:
            extracted[key] = value['N']
        elif 'BOOL' in value:
            extracted[key] = value['BOOL']
        elif 'M' in value:
            extracted[key] = extract_values(value['M'])  # Recursively extract values from nested map
        elif 'L' in value:
            extracted[key] = [extract_values(v) if isinstance(v, dict) else v for v in value['L']]  # Recursively extract values from list
        # Add more types as needed
        else:
            extracted[key] = value  # Handle unknown types appropriately
    return extracted

def extract_all_values(items):
    return [extract_values(item) for item in items]

  

