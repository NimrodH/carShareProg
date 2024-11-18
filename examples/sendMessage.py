import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
apigatewaymanagementapi = boto3.client('apigatewaymanagementapi', endpoint_url=os.environ['API_GATEWAY_ENDPOINT'])
connections_table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event, context):
    body = json.loads(event['body'])

    user_id = body['userId']
    start_auto_color = body['startAutoColor']
    seconds_offered = body['secondsOffered']

    # Update table with secondsOffered
    try:
        result = connections_table.update_item(
            Key={
                'ID': user_id,
                'startAutoColor': start_auto_color
            },
            UpdateExpression="set secondsOffered = :seconds",
            ExpressionAttributeValues={
                ':seconds': seconds_offered
            },
            ReturnValues="ALL_NEW"
        )
        print('Updated item:', json.dumps(result['Attributes'], indent=2))
    except Exception as error:
        print(f"Error saving data: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to save data'})
        }

    # Get pair information
    my_pair = None
    pair_auto_color = 'NO' if start_auto_color == 'YES' else 'YES'
    pair_seconds_offered = None
    my_connection_id = None
    pair_connection_id = None

    # Retrieve user's connectionId and myPairId
    try:
        response = connections_table.get_item(Key={'ID': user_id, 'startAutoColor': start_auto_color})
        if 'Item' in response:
            print('Retrieved item:', response['Item'])
            my_connection_id = response['Item']['connectionId']
            my_pair = response['Item']['myPairId']
        else:
            print('Item not found')
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Item not found', 'ansStatus': 'missing'})
            }
    except Exception as error:
        print(f"Error retrieving item: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to retrieve item'})
        }

    # Retrieve the pair's secondsOffered
    try:
        response = connections_table.get_item(Key={'ID': my_pair, 'startAutoColor': pair_auto_color})
        if 'Item' in response:
            print('Retrieved pair_item:', response['Item'])
            pair_connection_id = response['Item']['connectionId']
            pair_seconds_offered = response['Item']['secondsOffered']
            is_live = is_connection_live(pair_connection_id)
            if not is_live:
                return {
                    'statusCode': 410,
                    'body': json.dumps({'message': 'pair is not connected anymore', 'ansStatus': 'missing'})
                }
        else:
            print('Pair not found')
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Pair not CREATED yet', 'ansStatus': 'missing'})
            }
    except Exception as error:
        print(f"Error retrieving pair: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to retrieve pair'})
        }

    # Determine if deal is done
    if not pair_seconds_offered:
        print("Pair is still playing.")
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Pair is still playing', 'ansStatus': 'wait'})
        }

    do_deal = (int(seconds_offered) <= int(pair_seconds_offered)) if start_auto_color == "YES" else (int(seconds_offered) >= int(pair_seconds_offered))
    print(f"doDeal: {do_deal}")

    # Update both records with the doDeal value
    try:
        connections_table.update_item(
            Key={'ID': user_id, 'startAutoColor': start_auto_color},
            UpdateExpression="set dealDone = :deal",
            ExpressionAttributeValues={':deal': do_deal},
            ReturnValues="ALL_NEW"
        )
        connections_table.update_item(
            Key={'ID': my_pair, 'startAutoColor': pair_auto_color},
            UpdateExpression="set dealDone = :deal",
            ExpressionAttributeValues={':deal': do_deal},
            ReturnValues="ALL_NEW"
        )
        print('Updated dealDone for both users.')
    except Exception as error:
        print(f"Error saving dealDone: {error}")
        return {
            'statusCode': 500,
            'body': json.dumps({'message': 'Failed to save dealDone'})
        }

    # Prepare the message to send to both users
    message_body = {
        'message': f'Deal results are: {do_deal}',
        'ansStatus': 'continue',
        'isdealDone': do_deal,
        'pairSecondsOffered': pair_seconds_offered,
        'mySecondsOffered': seconds_offered
    }

    # Send message to both users
    if my_connection_id:
        try:
            apigatewaymanagementapi.post_to_connection(ConnectionId=my_connection_id, Data=json.dumps(message_body).encode('utf-8'))
            if pair_connection_id:
                apigatewaymanagementapi.post_to_connection(ConnectionId=pair_connection_id, Data=json.dumps(message_body).encode('utf-8'))
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Message sent successfully'})
            }
        except Exception as error:
            print(f"Error sending message: {error}")
            return {
                'statusCode': 500,
                'body': json.dumps({'message': 'Failed to send message'})
            }

    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Should not be sent, we have returns for all'})
    }

def is_connection_live(connection_id):
    try:
        apigatewaymanagementapi.post_to_connection(ConnectionId=connection_id, Data=json.dumps({'type': 'ping'}).encode('utf-8'))
        return True
    except apigatewaymanagementapi.exceptions.GoneException:
        print(f"Connection {connection_id} is no longer live.")
        return False
    except Exception as err:
        print(f"Error checking connection {connection_id}: {err}")
        raise
