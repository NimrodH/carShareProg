import json
import boto3
import os
from botocore.exceptions import ClientError
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
dynamodb_client = boto3.client('dynamodb')
apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.getenv('API_GATEWAY_ENDPOINT'))
avatars_table_name = os.environ['AVATARS_TABLE_NAME']
chats_table_name = os.environ['CHATS_TABLE_NAME']

def lambda_handler(event, context):
    # TODO implement
    #body = json.loads(event['body']
    body = json.loads(event['body'])
    print(body)
    connection_id = event['requestContext']['connectionId']
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
            # do nothing to body we just send the body to all as is
        case _:
            print("error: wrong body[type]: " + body["type"])

    #send to pair or all (we allreadychanged body when needed )
    if body["type"] == "chatRequest" or body["type"] == "chatEnd":
        send_to_other_clients(body)
    else: #updateChat, deal result
        send_to_pair(body)
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }

def send_to_other_clients(the_body):  ###including me  
    response = dynamodb_client.scan(TableName=avatars_table_name)
    for item in response['Items']:
        connection_id = item['connectionID']['S']
        try:
            response = apigatewaymanagementapi.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(the_body)
            )
            print("sent to others sent to: %s", connection_id )
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
        response = apigatewaymanagementapi.post_to_connection(
            #get the connection_id of the pair from table avatars following its ID
            ConnectionId=dest_con_id,
            Data=json.dumps(the_body)
        )
    except ClientError as error:
        print('Error sending message: %s', error)
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message sent successfully'})}

###find the dest (pair) connection_id by the sender connection_id
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
        print (item.get('connectionID'))
        return item.get('connectionID')
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

def update_chat(table_name, chat_id, new_text, region="us-east-1"):
    # Initialize DynamoDB table
    #dynamodb = boto3.resource('dynamodb', region_name=region)
    table = dynamodb.Table(table_name)

    # Perform the update operation
    response = table.update_item(
        Key={"chatID":chat_id},  # Primary key
        UpdateExpression="SET chatText = :ctxt",
        ExpressionAttributeValues={
            ":ctxt": new_text
        },
        ReturnValues="UPDATED_NEW"  # Return only the updated attributes
    )
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