# will get the data that user entered in the welcomMessage and
# CREATE line for the avatar in the signs table
#  and will get the position of the avatar from the urls table
#  and will lock the position in the urls table
#  create the avatar in the avatars table
#  and will return the position and URL of the avatar to the user


import json
import time
import boto3
import os
import copy
from botocore.exceptions import ClientError
import uuid
from datetime import datetime # for serverMsgId
#from decimal import Decimal

#class DecimalEncoder(json.JSONEncoder):
#    def default(self, obj):
#        if isinstance(obj, Decimal):
#            return float(obj)
#        return super(DecimalEncoder, self).default(obj)

#TODO: set 'API_GATEWAY_ENDPOINT'] & 'URLS_TABLE_NAME' & AVATARS_TABLE_NAME & SIGNS_TABLE_NAME
dynamodb = boto3.resource('dynamodb')
dynamodb_client = boto3.client('dynamodb')
#apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.environ['API_GATEWAY_ENDPOINT'])
urls_table = dynamodb.Table(os.environ['URLS_TABLE_NAME'])
avatars_table = dynamodb.Table(os.environ['AVATARS_TABLE_NAME'])
signs_table = dynamodb.Table(os.environ['SIGNS_TABLE_NAME'])
MAX_RETRIES = 50  # Maximum number of retries if an item is locked
RETRY_DELAY = 2  # Delay in seconds between retries
apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.getenv('API_GATEWAY_ENDPOINT'))
TTL_SECONDS = 5 * 60 #the time to keep each message (5 min)
_message_cache = {}      # maps messageId -> timestamp when first seen
retry_table = dynamodb.Table('PendingRetries')  

def _purge_expired():
    """Remove any entries older than TTL_SECONDS."""
    now = time.time()
    expired = [mid for mid, ts in _message_cache.items() if (now - ts) > TTL_SECONDS]
    for mid in expired:
        del _message_cache[mid]



def lambda_handler(event, context):
    """
    AWS Lambda function to handle avatar creation requests.

    This function processes an incoming event to create an avatar. It retrieves the connection ID from the event's
    request context, extracts the avatar data from the event body, and performs the following steps:
    1. Validates the presence of the 'ID' key in the body.
    2. Saves the sign data associated with the avatar.
    3. Finds and locks an item for the avatar. the item contaains the position of the avatar and the URL of the avatar
    4. Writes the avatar data to the database.
    5. Sends a response back to the client and notifies other clients.

    Parameters:
    event (dict): The event data passed to the Lambda function, containing request context and body.
        body: contains all data that will be used for the signData
        requestContext: contains the connectionId of the client
    context (object): The runtime information of the Lambda function.

    Returns:
    dict: A response object containing the status code and a message indicating the result of the operation.
    """
    ##print('Received event:', json.dumps(event, indent=2))
    # TODO implement
    _purge_expired()

    connection_id = event['requestContext']['connectionId']
    
    ### retrieve from the event body the data that user entered to welcome message
    body = json.loads(event['body'])
    message_id = body.get("messageId")
    
    print("body got from client:")
    print(body)
    #if it has no messageId we will execute anyway
    if (message_id):
        id4catch = message_id + "-" + connection_id
        #if message already in catch do noting and return
        if id4catch in _message_cache:
            # duplicate detected → drop on the floor
            print("duplicate detected → drop on the floor")
            return {
                "statusCode": 200,
                "body": json.dumps({"ok": True, "note": "duplicate, ignored"})
            }
        #we have messageId and its new message - write its number in catch
        _message_cache[id4catch] = time.time()

    if body.get(type) == "keepalive":
        #print("keepalive")
        return {
            'statusCode': 200,
            'body': json.dumps('keepalive')
        }
    if 'ack' in body:
        match body['ack']:
            case "serverMsgDone":
                #we got approval from client that he got the message and will send him the avatar
                ##print("Received ACK: serverMsgDone")
                serverMsgId = body.get('serverMsgId')
                if serverMsgId:                  
                    try:
                        retry_table.delete_item(
                            Key={
                                'connectionId': connection_id,
                                'messageId': serverMsgId
                            }
                        )
                        #print(f"Received serverMsgDone and delete for {serverMsgId}")
                    except Exception as error:
                        print(f"Error saving data serverMsgDone: {error}")                    
                return {
                    'statusCode': 200,
                    'body': json.dumps('ACK processed')
                }

            case "others":
                # need to send to each availabe client message to create the new one of sender (is it do it?)
                #print("Received ACK: others, message_id:")
                #print(message_id)
                ack_message_done = { "action" : "message_done", "responseTo" : "createAvatar" ,"messageId" : message_id}
                send2client(connection_id, ack_message_done)
                send_to_other_clients(connection_id, body.get("previousMessage", {}))
                #handleServerMessage(connection_id, body.get("previousMessage", {}))
                # Ask client to ACK before sending older avatars
                ack_message = {
                    "action": "waitForAck",
                    "nextStep": "older",
                    "previousMessage": body.get("previousMessage", {})
                }
                send2client(connection_id, ack_message)
            case "older": #need to add to sender all avatars in list if he dont have them
                ack_message_done = { "action" : "message_done", "responseTo" : "createAvatar" ,"messageId" : message_id}##
                send2client(connection_id, ack_message_done)##
                send_to_me_older_avatars(connection_id)##
                #print("Received ACK: older")
                ##ack: "serverMsgDone"(connection_id)
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'ACK processed'})
        }

    avatarID = body.get('avatarID')
    if avatarID is None:
        print("Error: 'avatarID' key is missing in the body.")
        return {
            'statusCode': 400,
            'body': json.dumps({'message': "'ID' key is missing in the body"})
        }
    save_sign_data(body, avatarID)
    avatar_pos_url = find_and_lock_item()
    if avatar_pos_url:
        print(f"Locked item details: {avatar_pos_url}")
    else:
        print("ERROR: Could not find or lock any item.")
        return {
            'statusCode': 400,
            'body': json.dumps({'message': 'Could not find or lock any item'})
    }
    #write in avatar table in dynamoDB
    write_avatar(avatarID, avatar_pos_url, connection_id, body['isMan'])
    #tell client that his message to createAvatar recived by the server
    ack_message_done = { "action" : "message_done", "responseTo" : "createAvatar" ,"messageId" : message_id}
    send2client(connection_id, ack_message_done)
    #print('message_done - createAvatar sent')
    #ask client to create the avatar in its own world
    currentMessage = { "action" : "createAvatar", "avatarDetails" : avatar_pos_url, "signData": body, "isMe" : "me", "connectionId" : connection_id}
    #print("send2client - - me")
    response = send2client(connection_id, currentMessage)
    message = { "action" : "createAvatar", "avatarDetails" : avatar_pos_url, "signData": body, "isMe" : "No", "connectionId" : connection_id}
    # Send instruction to client to ACK before next steps
    ack_message = { "action": "waitForAck", "nextStep": "others", "previousMessage": message }
    try:
        send2client(connection_id, ack_message)
        #print("waitForAck sent")
    except ClientError as error:
        print('Error sending message: %s', error)


    

    ## moved to ACK answer
    #send_to_other_clients(connection_id, message)
    #send_to_me_older_avatars(connection_id)
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Avatar created successfully'})
    }

def save_sign_data(body, avatarID):
    sign_data = {
        'isMan': body['isMan'],
        'address': body['address'],
        'day1to': body['day1to'],
        'day1back': body['day1back'],
        'day2to': body['day2to'],
        'day2back': body['day2back'],
        'day3to': body['day3to'],
        'day3back': body['day3back'],
        'day4to': body['day4to'],
        'day4back': body['day4back'],
        'day5to': body['day5to'],
        'day5back': body['day5back'],
        'userName': body['userName']
    }
    
    ### create line for the avatar in the signs table
    put_params = {
        'TableName': signs_table.name,
        'Item': {
            'avatarID': avatarID,
            **sign_data
        }
    }

    try:
        ### Save the item to DynamoDB
        signs_table.put_item(Item=put_params['Item'])
    except Exception as error:
        print(f"Error saving data: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to save sign data'})
        }
        
     #################
 
 ##############

    ### create line for the avatar in the avatars table
def write_avatar(avatarID, avatar_pos_url, connection_id, isMan):
    if (isMan):
        url = avatar_pos_url["avatarURLBoy"]
    else:
        url = avatar_pos_url["avatarURL"]
    avatar_params = {
        'TableName': avatars_table.name,
        'Item': {
            'avatarID': avatarID,
            'x': avatar_pos_url["x"],
            'y': avatar_pos_url["y"],
            'z': avatar_pos_url["z"],
            'targetX': avatar_pos_url["targetX"],
            'targetY': avatar_pos_url["targetY"],
            'targetZ': avatar_pos_url["targetZ"],
            'isTalking': False,
            'connectionId': connection_id,
            'avatarURL': url
        }
    }
    try:
        ### Save the item to the avatars table in DynamoDB
        avatars_table.put_item(Item=avatar_params['Item'])
    except Exception as error:
        print(f"Error saving data: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to save avatar data'})
        }
 
    ###get one of the free items in URLs & palaces table
def get_unlocked_item():
    oneFreePosURL = urls_table.query(
        IndexName='isUsed-num-index',  # Ensure you have a GSI on 'isUsed' attribute
        KeyConditionExpression='isUsed = :false',
        ExpressionAttributeValues={':false': 'false'},  # Use 'false' as a string
        Limit=1  # Only fetch one unlocked item
    )
    items = oneFreePosURL.get('Items', [])
    return items[0] if items else None
 
def lock_item(unlocked_item_id):
    if unlocked_item_id is None:
        print("Item ID is None, cannot lock item.")
        return False

    try:
        dynamodb_client.transact_write_items(
            TransactItems=[
                {
                    'Update': {
                        'TableName': urls_table.name,
                         'Key': {
                            'num': {'S': unlocked_item_id}
                        },
                        'UpdateExpression': 'SET isUsed = :true',
                        'ConditionExpression': 'attribute_not_exists(isUsed) OR isUsed = :false',
                        'ExpressionAttributeValues': {
                            ':true': {'S': 'true'},
                            ':false': {'S': 'false'} 
                        }
                    }
                }
            ]
        )
        return (True, None)
    except dynamodb_client.exceptions.TransactionCanceledException as e:
        #print("ERROR: TransactionCanceledException:")
        #print(e)
        if 'CancellationReasons' in e.response:
            for reason in e.response['CancellationReasons']:
                print(json.dumps(reason, indent=2))
        return (False, str(e))
    except Exception as e:
        print("Unexpected error:")
        print(e)
        return (False, str(e))

def find_and_lock_item(): 
    retries = 0
    while retries < MAX_RETRIES:
        # Attempt to fetch an unlocked item from the URLs table
        item = get_unlocked_item()
        ##print("lock_item:")
        ##print(item)
        if not item:
            print("ERROR: No available unlocked items found in the URLs table.")
            return None

        unlocked_item_id = item['num']#['S']
        ##print(f"Trying to lock item: {unlocked_item_id}")

        # Attempt to lock the item
        success, error_message = lock_item(unlocked_item_id)
        if success:
            print(f"Item {unlocked_item_id} locked successfully!")
            return item
        
        # If locking failed, wait and retry
        retries += 1
        #print(f"Retrying... ({retries}/{MAX_RETRIES})")
        time.sleep(RETRY_DELAY)
    
    #print("Max retries reached. Unable to lock an item.")
    return None

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

def send_to_me_older_avatars(my_connection_id):
    avatrs_array = dynamodb_client.scan(TableName=os.environ['AVATARS_TABLE_NAME'])
    ##print(avatrs_array)
    extracted_avatrs_array = extract_all_values(avatrs_array['Items'])
    ##print(extracted_avatrs_array)
    signs_data_array = dynamodb_client.scan(TableName=os.environ['SIGNS_TABLE_NAME'])
    ##print(signs_data_array)
    extracted_signs_data_array = extract_all_values(signs_data_array['Items'])
    message = { "action" : "createMissingAvatars", "avatarArray" : extracted_avatrs_array, "signDataArray": extracted_signs_data_array }
    response = send2client(my_connection_id, message)
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

#set all the items in the urls table to be free and call to delete avatars and signs
def set_all_items_free():
    response = dynamodb_client.scan(TableName=os.environ['URLS_TABLE_NAME'])
    for item in response['Items']:
        item_id = item['num']['S']
        try:
            dynamodb_client.update_item(
                TableName=os.environ['URLS_TABLE_NAME'],
                Key={'num': {'S': item_id}},
                UpdateExpression='SET isUsed = :false',
                ExpressionAttributeValues={':false': {'S': 'false'}}
            )
        except ClientError as e:
            print(f"Error updating item {item_id}: {e}")
            continue
    delete_all_signs()
    delete_all_avatars()
    return {'statusCode': 200, 'body': json.dumps({'message': 'All items set to free'})}

#delete all the items in the avatars table
def delete_all_avatars():
    response = dynamodb_client.scan(TableName=os.environ['AVATARS_TABLE_NAME'])
    for item in response['Items']:
        item_id = item['avatarID']['S']
        try:
            dynamodb_client.delete_item(
                TableName=os.environ['AVATARS_TABLE_NAME'],
                Key={'avatarID': {'S': item_id}}
            )
        except ClientError as e:
            print(f"Error deleting item {item_id}: {e}")
            continue
    #return {'statusCode': 200, 'body': json.dumps({'message': 'All avatars deleted'})}

#delete all the items in the signs table
def delete_all_signs():
    response = dynamodb_client.scan(TableName=os.environ['SIGNS_TABLE_NAME'])
    for item in response['Items']:
        item_id = item['avatarID']['S']
        try:
            dynamodb_client.delete_item(
                TableName=os.environ['SIGNS_TABLE_NAME'],
                Key={'avatarID': {'S': item_id}}
            )
        except ClientError as e:
            print(f"Error deleting item {item_id}: {e}")
            continue
    #return {'statusCode': 200, 'body': json.dumps({'message': 'All signs deleted'})}
  

