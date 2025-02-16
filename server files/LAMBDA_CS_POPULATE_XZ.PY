import json
import boto3

dynamodb = boto3.resource('dynamodb')
tablePlace = dynamodb.Table('cs_avatarsURLplace')
tableAvatars = dynamodb.Table('cs_avatars')
tableSigns = dynamodb.Table('cs_signs')

def lambda_handler(event, context):

    coordinates = [
        (6.000000, 0.000000), (5.868886, 1.247470), (5.481273, 2.440420),
        (4.854102, 3.526712), (4.014784, 4.458869), (3.000000, 5.196153),
        (1.854102, 5.707107), (0.627905, 5.971530), (-0.627905, 5.971530),
        (-1.854102, 5.707107), (-3.000000, 5.196153), (-4.014784, 4.458869),
        (-4.854102, 3.526712), (-5.481273, 2.440420), (-5.868886, 1.247470),
        (-6.000000, 0.000000), (-5.868886, -1.247470), (-5.481273, -2.440420),
        (-4.854102, -3.526712), (-4.014784, -4.458869), (-3.000000, -5.196153),
        (-1.854102, -5.707107), (-0.627905, -5.971530), (0.627905, -5.971530),
        (1.854102, -5.707107), (3.000000, -5.196153), (4.014784, -4.458869),
        (4.854102, -3.526712), (5.481273, -2.440420), (5.868886, -1.247470)
    ]
#avatarPlaces & URLs
    delete_all_items(tablePlace, 'num')
    for i, (x, y) in enumerate(coordinates):
        if i < 20:
            used = "true"
        else:
            used = "false"
        try:
            item = {
                'num': str(i),               # Assuming 'num' is a unique identifier
                'x': str(x),                 # Populating x coordinate
                'z': str(y),                 # Populating z coordinate
                'avatarURL': 'https://models.readyplayer.me/66d95426b7460aedd5563433.glb',             # Placeholder
                'isBoy': "false",              # Placeholder
                'isUsed': used,             # Placeholder
                'targetX': '0',               # Placeholder
                'targetY': '0',               # Placeholder
                'targetZ': '0',               # Placeholder
                'y': '0'                      # Placeholder
            }

            # Insert item into DynamoDB
            tablePlace.put_item(Item=item)
        except Exception as e:
            print(f"Error inserting item {i}: {e}")
#avatars
    delete_all_items(tableAvatars, 'avatarID')
    for i, (x, y) in enumerate(coordinates):
        if i < 20:
            try:
                # Example data, update other attributes as needed
                item = {
                    'avatarID': str(i+10),               # Assuming 'num' is a unique identifier
                    'x': str(x),                 # Populating x coordinate
                    'z': str(y),                 # Populating z coordinate
                    'avatarURL': 'https://models.readyplayer.me/66d95426b7460aedd5563433.glb',             # Placeholder
                    'isTalking': False,              # Placeholder
                    'driveAgreed': False,             # Placeholder
                    'targetX': '0',               # Placeholder
                    'targetY': '0',               # Placeholder
                    'targetZ': '0',               # Placeholder
                    'y': '0',
                    'connectionID': '1111'                      # Placeholder
                }

                # Insert item into DynamoDB
                tableAvatars.put_item(Item=item)
            except Exception as e:
                print(f"Error inserting item {i}: {e}")
#signs 
    delete_all_items(tableSigns, 'avatarID')   
    for i, (x, y) in enumerate(coordinates):
        if i < 20:
            try:
                # Example data, update other attributes as needed
                item = {
                    'avatarID': str(i+10),               # Assuming 'num' is a unique identifier
                    'address': str(i),                 # Populating x coordinate
                    'day1back': '12:00',                 # Populating z coordinate
                    'day1to': '08:00',             # Placeholder
                    'day2back': '12:00',                 # Populating z coordinate
                    'day2to': '08:00',             # Placeholder
                    'day3back': '12:00',                 # Populating z coordinate
                    'day3to': '08:00',             # Placeholder
                    'day4back': '12:00',                 # Populating z coordinate
                    'day4to': '08:00',             # Placeholder
                    'day5back': '12:00',                 # Populating z coordinate
                    'day5to': '08:00',             # Placeholder
                    'isMan': False,              # Placeholder
                    'userName': str(i)             # Placeholder
                }

                # Insert item into DynamoDB
                tableSigns.put_item(Item=item)
            except Exception as e:
                print(f"An error occurred: {e.response['Error']['Message']}")

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

