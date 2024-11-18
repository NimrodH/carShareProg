import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    print('Received event:', json.dumps(event, indent=2))
    
    connection_id = event['requestContext']['connectionId']
    body = json.loads(event['body'])

    user_id = body['userId']
    start_auto_color = body['startAutoColor']
    group = body['group']
    pair_name = body['pairName']
    my_pair_id = body['myPairId']

    put_params = {
        'TableName': os.environ['TABLE_NAME'],
        'Item': {
            'connectionId': connection_id,
            'ID': user_id,
            'startAutoColor': start_auto_color,
            'group': group,
            'pairName': pair_name,
            'myPairId': my_pair_id
        }
    }

    print(f"connectionId in initUser: {connection_id}")

    try:
        # Save the item to DynamoDB
        connections_table.put_item(Item=put_params['Item'])
    except Exception as error:
        print(f"Error saving data: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to save data'})
        }
    
    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Data received and stored successfully'})
    }
