def send2client(connection_id, the_body, msg_type = "singleClient"):
    events = boto3.client('events')
    EVENTBRIDGE_RULE_NAME = 'RetryEveryMinute'

    # ← unchanged: we still deep-copy the incoming body
    payload = copy.deepcopy(the_body)

    # ← CHANGED: stamp once, only if this isn’t an ACK and no ID exists yet
    if payload["action"] != "message_done":
        if "serverMsgId" not in payload:
            server_msg_id = f"msg-{int(datetime.utcnow().timestamp() * 1000)}"
            payload["serverMsgId"] = server_msg_id

            # ← CHANGED: persist for retries exactly once
            retry_table.put_item(
                Item={
                    "connectionId": connection_id,
                    "messageId":    server_msg_id,
                    "payload":      payload,
                    "retryCount":   0,
                    "timestamp":    datetime.utcnow().isoformat()
                }
            )
            # ← CHANGED: enable the EventBridge rule exactly once
            events.enable_rule(Name=EVENTBRIDGE_RULE_NAME)

    # ← unchanged: still only send if we have a connection
    if connection_id:
        try:
            # ← unchanged: send (or re-send) the exact same payload
            apigatewaymanagementapi.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(payload)
            )
            # ← unchanged: normal success return
            return {"statusCode": 200}

        except ClientError as error:
            # ← unchanged: on failure we do NOT re-persist (so no new ID),
            #              we still let the caller handle multi-client vs. single
            if msg_type == "multyClients":
                raise
            return {
                "statusCode": 500,
                "body":       json.dumps({"message": "Failed to send message"})
            }