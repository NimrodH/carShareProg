#populate table cs_avatarsURLplace
import json
import boto3

dynamodb = boto3.resource('dynamodb')
tablePlace = dynamodb.Table('cs_avatarsURLplace')
numUsed = 0

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

    urlsBoys = [
        "https://models.readyplayer.me/67ff3aab70502e5738db65bc.glb",
        "https://models.readyplayer.me/67ff3b6df84012b508258a62.glb",
        "https://models.readyplayer.me/67ff3bc270502e5738db802b.glb",
        "https://models.readyplayer.me/67ff3d1579474b7a6c733b4a.glb",
        "https://models.readyplayer.me/67ff3db06026f5144da76157.glb",
        "https://models.readyplayer.me/67ff3e9c31f1c6f08b4b9823.glb",
        "https://models.readyplayer.me/67ff3fa56026f5144da78008.glb",
        "https://models.readyplayer.me/67ff408770502e5738dbd130.glb",
        "https://models.readyplayer.me/6800943a31f1c6f08b68bf21.glb",
        "https://models.readyplayer.me/6800a94a679b181682ce3dd0.glb",
        
        "https://models.readyplayer.me/6800ac856026f5144dc56345.glb",
        "https://models.readyplayer.me/6800acf031f1c6f08b698e9c.glb",
        "https://models.readyplayer.me/6800ad6613b3fb7e8ad30ba2.glb",
        "https://models.readyplayer.me/6800ade66026f5144dc56e9f.glb",
        "https://models.readyplayer.me/6800ae66647a08a2e396ced2.glb",
        "https://models.readyplayer.me/6800aedb679b181682ce70f0.glb",
        "https://models.readyplayer.me/6800af64d620f895205e7416.glb",
        "https://models.readyplayer.me/6800afff647a08a2e396dacc.glb",
        "https://models.readyplayer.me/6800b08cca0bde41411e412b.glb",
        "https://models.readyplayer.me/6800b12fca0bde41411e45cf.glb",
        #duplicated
        "https://models.readyplayer.me/6800ac856026f5144dc56345.glb",
        "https://models.readyplayer.me/6800acf031f1c6f08b698e9c.glb",
        "https://models.readyplayer.me/6800ad6613b3fb7e8ad30ba2.glb",
        "https://models.readyplayer.me/6800ade66026f5144dc56e9f.glb",
        "https://models.readyplayer.me/6800ae66647a08a2e396ced2.glb",
        "https://models.readyplayer.me/6800aedb679b181682ce70f0.glb",
        "https://models.readyplayer.me/6800af64d620f895205e7416.glb",
        "https://models.readyplayer.me/6800afff647a08a2e396dacc.glb",
        "https://models.readyplayer.me/6800b08cca0bde41411e412b.glb",
        "https://models.readyplayer.me/6800b12fca0bde41411e45cf.glb",

        "https://models.readyplayer.me/6800b1c82a9c5c70a40f8227.glb"
    ]

    urlsGirls = [
        "https://models.readyplayer.me/67ff2fec30c4def57986509d.glb",
        "https://models.readyplayer.me/67ff35cc679b181682af9337.glb",
        "https://models.readyplayer.me/67ff38df13b3fb7e8ab49874.glb",
        "https://models.readyplayer.me/67ff39f4679b181682b011df.glb",
        "https://models.readyplayer.me/67ff3c0613b3fb7e8ab4e847.glb",
        "https://models.readyplayer.me/67ff3c7356f46e3036a894b7.glb",
        "https://models.readyplayer.me/67ff3cdb31f1c6f08b4b7ba1.glb",
        "https://models.readyplayer.me/67ff3d5e6026f5144da75c16.glb",
        "https://models.readyplayer.me/67ff3e3113b3fb7e8ab511f1.glb",
        "https://models.readyplayer.me/67ff3f4564ce38bc90b4529c.glb",

        "https://models.readyplayer.me/67ff40e86026f5144da79084.glb",
        "https://models.readyplayer.me/67ffb6a070502e5738e148e4.glb",
        "https://models.readyplayer.me/67ffb72c56f46e3036ae5ba4.glb",
        "https://models.readyplayer.me/6800a816d620f895205e32fe.glb",
        "https://models.readyplayer.me/6800e2b5679b181682d01664.glb",
        "https://models.readyplayer.me/6800e2fa79474b7a6c9303c1.glb",
        "https://models.readyplayer.me/6800e37231f1c6f08b6b4cfb.glb",
        "https://models.readyplayer.me/6800e3e5679b181682d023fb.glb",
        "https://models.readyplayer.me/6800e47031f1c6f08b6b594e.glb",
        "https://models.readyplayer.me/66d95426b7460aedd5563433.glb",
            #duplicated
        "https://models.readyplayer.me/67ff40e86026f5144da79084.glb",
        "https://models.readyplayer.me/67ffb6a070502e5738e148e4.glb",
        "https://models.readyplayer.me/67ffb72c56f46e3036ae5ba4.glb",
        "https://models.readyplayer.me/6800a816d620f895205e32fe.glb",
        "https://models.readyplayer.me/6800e2b5679b181682d01664.glb",
        "https://models.readyplayer.me/6800e2fa79474b7a6c9303c1.glb",
        "https://models.readyplayer.me/6800e37231f1c6f08b6b4cfb.glb",
        "https://models.readyplayer.me/6800e3e5679b181682d023fb.glb",
        "https://models.readyplayer.me/6800e47031f1c6f08b6b594e.glb",
        "https://models.readyplayer.me/66d95426b7460aedd5563433.glb"
    ]
#avatarPlaces & URLs
    delete_all_items(tablePlace, 'num')
    for i, (x, y) in enumerate(coordinates):
        if i < numUsed:
            used = "true"
        else:
            used = "false"
        try:
            item = {
                'num': str(i),               # Assuming 'num' is a unique identifier
                'x': str(x),                 # Populating x coordinate
                'z': str(y),                 # Populating z coordinate
                'avatarURL': urlsGirls[i], #'https://models.readyplayer.me/66d95426b7460aedd5563433.glb',             # Placeholder
                'avatarURLBoy': urlsBoys[i], #'https://models.readyplayer.me/67ff3aab70502e5738db65bc.glb',
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

