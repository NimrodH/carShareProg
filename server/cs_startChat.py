import json
import time
import boto3
import os
import copy
from botocore.exceptions import ClientError
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
#dynamodb_client = boto3.client('dynamodb')
apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.getenv('API_GATEWAY_ENDPOINT'))
avatars_table_name = os.environ['AVATARS_TABLE_NAME']
chats_table_name = os.environ['CHATS_TABLE_NAME']
retry_table = dynamodb.Table('PendingRetries')
avatars_table = dynamodb.Table(avatars_table_name)# 
TTL_SECONDS = 5 * 60 #the time to keep each message (5 min)
_message_cache = {}      # maps messageId -> timestamp when first seen

def _purge_expired():
    """Remove any entries older than TTL_SECONDS."""
    now = time.time()
    expired = [mid for mid, ts in _message_cache.items() if (now - ts) > TTL_SECONDS]
    for mid in expired:
        del _message_cache[mid]


def lambda_handler(event, context):
    #RESPONSE TO http calls and if they fit don't use old websocket option
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method")
    path = event.get("rawPath") or event.get("path") or event.get("resource")  # v2 fallback

    print(f"🔍 HTTP Method: {method}")
    print(f"🔍 Path: {path}")
    print(f"🔍 Event: {event}")
    if path == "/V1/chat/sendLine" and method == "POST":
        return handle_send_line(event)
    elif path == "/V1/chat/getText" and method == "GET":
        return handle_get_text(event)
    #if not return above then ruמ as before the web socket work (i.e for start chat)
    body = json.loads(event['body'])
    print(body)
    connection_id = event['requestContext']['connectionId']
    _purge_expired()
    message_id = body.get("messageId")
    if message_id:
        id4catch = message_id + "-" + connection_id
        if id4catch in _message_cache:
            print(f"Duplicate message {id4catch}")
            return {
                'statusCode': 200,
                'body': json.dumps('Duplicate message')
            }
        _message_cache[id4catch] = time.time()
        
    if 'ack' in body:
        #we got approval from client that he got the message and will send him the avatar
        #print("Received ACK: serverMsgDone")
        serverMsgId = body.get('serverMsgId')
        if serverMsgId:                  
            try:
                retry_table.delete_item(
                    Key={
                        'connectionId': connection_id,
                        'messageId': serverMsgId
                    }
                )
                print(f"Received serverMsgDone and delete for {serverMsgId}")
            except Exception as error:
                print(f"Error saving data serverMsgDone: {error}")
            
        return {
            'statusCode': 200,
            'body': json.dumps('ACK processed')
        }
    else:
        match body["type"]:
            case "updateChat":
                ### new line added we will get and replace all text
                chat_id = body["chatID"]
                new_text =body["chatText"]
                update_chat(chats_table_name, chat_id, new_text, region="us-east-1")
            case "chatRequest":
                current_time = datetime.now().strftime("%H:%M:%S")
                item = {"chatID": body["chatID"], "fromAvatarID": body["fromAvatarID"], "toAvatarID": body["toAvatarID"], "startTime": current_time}
                new_item(chats_table_name, item)
            case "dealResult":
                writeAvatarAnswer(body["chatID"],body["destID"], body["fromAvatarID"], body["toAvatarID"], body["senderAnswer"])
                result = getAvatarAnswer(body["chatID"],body["destID"], body["fromAvatarID"], body["toAvatarID"])
                body["destAnswer"] = result
            case "chatEnd":
                current_time = datetime.now().strftime("%H:%M:%S")
                update_endTime(chats_table_name, body["chatID"], current_time, region="us-east-1")
                ####send_to_pair(body)# will send to pair, and then in the following  we will send to others not including ones "inChat"
                # do nothing to body we just send the body to all as is
            case _:
                print("error: wrong body[type]: " + body["type"])

        # send confirm to client about getting his message
        
        ack_message_done = { "action" : "message_done", "responseTo" : "createAvatar" ,"messageId" : message_id}
        send2client(connection_id, ack_message_done)
        #send to pair or all (we allreadychanged body when needed )
        if body["type"] == "chatRequest" or body["type"] == "chatEnd":
            send_to_other_clients(body)
        else: #updateChat, deal result
            send_to_pair(body)
        return {
            'statusCode': 200,
            'body': json.dumps('Hello from Lambda!')
        }

def handle_send_line(event):
    body = json.loads(event.get('body', '{}'))
    chat_id = body["chatID"]
    new_line = body["newLine"]

    try:
        update_chat(chats_table_name, chat_id, new_line)
        item = dynamodb.Table(chats_table_name).get_item(Key={'chatID': chat_id}).get('Item', {})
        return {
            'statusCode': 200,
            'headers': {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            'body': json.dumps({'chatText': item.get('chatText', '')})
        }
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}


def handle_get_text(event):
    chat_id = event["queryStringParameters"]["chatID"]
    try:
        item = dynamodb.Table(chats_table_name).get_item(Key={'chatID': chat_id}).get('Item', {})
        return {
            'statusCode': 200,
            'headers': {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
            'body': json.dumps({'chatText': item.get('chatText', '')})
        }
    except Exception as e:
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

def send_to_other_clients(the_body):  ###including me  
    response = avatars_table.scan()

    for item in response['Items']:
        connection_id = item['connectionId']
        itemStatus = item['status']
        aavatarID = item['avatarID']
        if itemStatus == "inChat" and aavatarID != the_body["fromAvatarID"] and aavatarID != the_body["toAvatarID"] :
            continue
        try:
            send2client(connection_id, the_body, "multyClients")
            #response = apigatewaymanagementapi.post_to_connection(
            #    ConnectionId=connection_id,
            #    Data=json.dumps(the_body)
            #)
            print("sent to others sent to: %s", connection_id)
        except ClientError as error:
            print('Error sending message: %s', error)
            continue
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}

### use get_connectionId to find my pair connection_id andd send him the update 

def send_to_pair(the_body):
    if the_body["type"] == "dealResult":
        send_to_avatar(the_body, the_body["senderID"])
    send_to_avatar(the_body, the_body["destID"])
    

def send_to_avatar(the_body, avatarID):
    try:
        dest_con_id = get_connectionId(avatarID)
        print("send_to_avatar sent to avatarID: " + avatarID)
    except ClientError as error:
        print('Error getting connection ID: %s', error)

    send2client(dest_con_id, the_body)
    #response = apigatewaymanagementapi.post_to_connection(
    #    #get the connection_id of the pair from table avatars following its ID
    #    ConnectionId=dest_con_id,
    #    Data=json.dumps(the_body)
    #)
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}

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
                    print(f"Enabled EventBridge rule {EVENTBRIDGE_RULE_NAME}")
                except Exception as e:
                    print(f"Failed to enable EventBridge rule: {str(e)}")

            return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}
        except ClientError as error:
            print('Error sending message: %s', error)
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


###wrong comment? find the dest (pair) connection_id by the sender connection_id
def get_connectionId(dest_id):
    print("dest_id: " + dest_id)
    table = dynamodb.Table(avatars_table_name)
    response = table.get_item(
        Key={
            'avatarID': dest_id
        }
    )
    # Check if the item exists and return the value of "connectioID"
    item = response.get('Item')
    if item:
        print (item.get('connectionId'))
        return item.get('connectionId')
    else:
        return None

def getAvatarAnswer(chat_id, dest_id, fromAvatarID, toAvatarID):
    print("dest_id: " + dest_id)
    #dynamodb = boto3.resource('dynamodb', region_name=region)
    table = dynamodb.Table(chats_table_name)
    response = table.get_item(
        Key={
            'chatID': chat_id
        }
    )
    #read answer of the pair
    if dest_id == fromAvatarID:
        column = "fromAnswer"
    else:
        column = "toAnswer"
    # Check if the item exists and return the value of "connectioID"
    item = response.get('Item')
    if item:
        if item.get(column):
            print ("theAnswer: " + item.get(column))
            return item.get(column)
        else:
            print ("theAnswer none" )
            return None
    else:
        return None

def writeAvatarAnswer(chat_id, dest_id, fromAvatarID, toAvatarID, answer):
    #dynamodb = boto3.resource('dynamodb', region_name=region)
    table = dynamodb.Table(chats_table_name)
    #write answer of me
    if dest_id == fromAvatarID:
        column = "toAnswer"
    else:
        column = "fromAnswer"
    

    # Perform the update operation
    response = table.update_item(
        Key={"chatID":chat_id},  # Primary key
        UpdateExpression="SET " + column + " = :ctxt",
        ExpressionAttributeValues={
            ":ctxt": answer
        },
        ReturnValues="UPDATED_NEW"  # Return only the updated attributes
    )


def new_item(table_name, item, region="us-east-1"):
    table = dynamodb.Table(chats_table_name)
    response = table.put_item(Item=item)
    return response

def update_chat(table_name, chat_id, new_line, region="us-east-1"):
    table = dynamodb.Table(table_name)

    try:
        # Step 1: Read current state
        item = table.get_item(Key={"chatID": chat_id}).get('Item', {})
        old_text = item.get("chatText", "")
        old_count = item.get("lineCount", 0)

        # Step 2: Append new line
        new_text = old_text + new_line + "\n"
        new_count = old_count + 1

        # Step 3: Try conditional update to avoid race
        try:
            response = table.update_item(
                Key={"chatID": chat_id},
                UpdateExpression="SET chatText = :txt, lineCount = :cnt",
                ConditionExpression="lineCount = :expected OR attribute_not_exists(lineCount)",
                ExpressionAttributeValues={
                    ":txt": new_text,
                    ":cnt": new_count,
                    ":expected": old_count
                },
                ReturnValues="UPDATED_NEW"
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                print("🔁 Conflict: lineCount changed. Retrying after re-read.")
                # Fallback: re-read and retry without condition
                item = table.get_item(Key={"chatID": chat_id}).get('Item', {})
                old_text = item.get("chatText", "")
                old_count = item.get("lineCount", 0)
                new_text = old_text + new_line + "\n"
                new_count = old_count + 1

                response = table.update_item(
                    Key={"chatID": chat_id},
                    UpdateExpression="SET chatText = :txt, lineCount = :cnt",
                    ExpressionAttributeValues={
                        ":txt": new_text,
                        ":cnt": new_count
                    },
                    ReturnValues="UPDATED_NEW"
                )
            else:
                raise

        # Step 4: Return updated paragraph
        return new_text

    except Exception as e:
        print("❌ Error in update_chat:", e)
        raise

    # set message to the other chater

def update_endTime(table_name, chat_id, endTime, region="us-east-1"):
    # Initialize DynamoDB table
    #dynamodb = boto3.resource('dynamodb', region_name=region)
    table = dynamodb.Table(table_name)

    # Perform the update operation
    response = table.update_item(
        Key={"chatID":chat_id},  # Primary key
        UpdateExpression="SET endTime = :ctxt",
        ExpressionAttributeValues={
            ":ctxt": endTime
        },
        ReturnValues="UPDATED_NEW"  # Return only the updated attributes
    )

    return response