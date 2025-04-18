#delete all avatars and signs and chats
import json
import boto3

dynamodb = boto3.resource('dynamodb')
tableAvatars = dynamodb.Table('cs_avatars')
tableSigns = dynamodb.Table('cs_signs')
tableChats = dynamodb.Table('cs_chats')

def lambda_handler(event, context):
#avatars
    delete_all_items(tableAvatars, 'avatarID')
#signs 
    delete_all_items(tableSigns, 'avatarID')   
#chats 
    delete_all_items(tableChats, 'chatID')   

def delete_all_items(table, primary_key):
    try:
        # Scan the table to get all items
        response = table.scan()
        items = response.get('Items', [])

        # Loop through and delete each item
        for item in items:
            key = {primary_key: item[primary_key]}

            table.delete_item(Key=key)
            print(f"Deleted item with key: {key}")

        # Handle pagination if there are more items
        while 'LastEvaluatedKey' in response:
            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            items = response.get('Items', [])

            for item in items:
                key = {primary_key: item[primary_key]}

                table.delete_item(Key=key)
                print(f"Deleted item with key: {key}")

        print("All items deleted successfully.")

    except Exception as e:
        print("An error occurred")
        print(e)

    return {
        'statusCode': 200,
        'body': json.dumps('Items inserted successfully!')
    }

