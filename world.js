//var scene = window.scene;
///my Avatar is this._avatarsArr[0].avatar
class World {
    constructor(scene) {
        this._avatarsArr = [];///contains objects whith the avata, id and name
        this._wellcome = new Wellcome(this);
        this.myAvatar = {};///the avatar of the user that saved inside the _avatarsArr[0].avatar
        //this.myAvatarID = null;
        this.allowPointer = false;
        this.msg = null;/// for messageScreen
    }

    ///will be called by Message
    async wellcomeDone(signData) {
        ///show message: "loading"
        const loadingMessage = `המתן - טוען אווטרים
כאשר שלט זה ייסגר חלק מהאווטרים יציגו 
שלט עם פרטי הנסיעה המעניינים אותם
ניתן יהיה ללחוץ על הכפתור בשלט
 כדי לקיים שיחת צ'אט עם אווטר רלוונטי`;
        this.msg = new MessageScreen(this, loadingMessage, 'info');
        ///send HTTP request to create the avatar
        signData.isLoading = true;///set the loading state to true
        await postData("addAvatar", signData);/// comment for debug without server. change get , too ////////////////////////
        ///open websocket connection to the server and write the connection ID to get updates about others
        ///the original state of the is "loading". we will set it to "noChat" only when all avatars in his world are loaded
        await wsClient.safeSend({
            action: 'createAvatar',
            type: 'createAvatar',
            avatarID: signData.avatarID,
            status: "loading"
        }, signData.avatarID);

        ///save myAvatar details (no need to object avatar for my avartar))
        //this.myAvatar = new Avatar({}, this);///create the avatar object for my avatar - it will have no mesh and no avatrData
        //this.myAvatar.userData = signData;///save the avatarID of my avatar
        ///loop avatarsDataArray to create (new Avatar) and then load (use acreateAvatarMesh and placeAvatr from Avatar.js) all avatar images
        let iterationText = 1;
        ///avatarsDataArray contains URLs and other constant data for all avatars differ then user data. each iten has unic "num"
        ///in this loop we create avatarObj with avatarMesh for each item in avatarsDataArray and add it to the _avatarsArr
        if (Array.isArray(avatarsDataArray)) {
            for (const avatarData of avatarsDataArray) {
                this.msg.updateIterationText(`${iterationText} / ${avatarsDataArray.length}`);
                iterationText++;
                // Create a new Avatar instance
                const avatar = new Avatar(avatarData, this);
                // Optionally, store avatar object if needed
                // await to ensure mesh is created and placed before continuing
                await avatar.createAvatarMesh(scene);
                await avatar.placeAvatar();
                // Add to _avatarsArr for tracking
                this._avatarsArr.push(avatar);
            }
        }
        this.msg.updateMessageText("ממתין לאחרים");///update the message to "waiting for others"
        this.allowPointer = true;
        ///start update by ping
        let result = await getData("getAllStatuses");/////get all the signs and avatars from the server////////////
        //let signs = debugUsersArray;///for debug without server. change post, too.//////////////////
        ///in this loop for each user (list of them returned from server) we collect free avatr and add to it the user data
        const signs = result.signs;
        //const avatars = result.avatars;

        if (Array.isArray(signs)) {
            for (const sign of signs) {
                //console.log("CC- getAllStatuses: " + JSON.stringify(sign));
                let currAvatar = this.getFreeAvatar(sign.isMan);
                if (!currAvatar) {
                    console.warn("No free avatar found to add to the world.");
                    continue;
                }
                if (sign.avatarID == signData.avatarID) {
                    this.myAvatar = currAvatar;///set myAvatar to the one that my signData post for it before
                }
                await currAvatar.matchUser(sign);///match the user to the avatar
            }
        } else {
            console.warn("CC- getAllStatuses: No signs found or signs is not an array.");
        }
        this.myAvatar.setState("me");///hide the buttons on my avatar
        ///after all avatars are loaded we can set the status of my avatar to "noChat" in all sessions
        ///the ones that already rgistered to the server will get this websocket update
        ///others will see the status on the avatars table
        ///(we will reupdate it in seperate http get repeating message, too)
        await wsClient.safeSend({
            action: 'createAvatar',
            type: 'setStatus',
            avatarID: signData.avatarID,
            status: "noChat"
        }, signData.avatarID);
        /// write isLoading=false (to set status) to signData as backup to the setting of stause=noChat in table cs_avatars
        /// we will use it in case that websocket failed(in the periodic update)
        ///  and when we create new user that allready end loading
        ///set the loading state to false in the server
        patchData(signData.avatarID, "isLoading", false)
            .then(res => {
                console.log("Update success:", res);
            })
            .catch(err => {
                console.error("Update failed:", err.message);
            });

        ///hide message "loading"
        this.msg.clearInstance();///clear the message screen
        this.msg = null;///clear the message screen

        this.periodicUpdateInterval = this.startPeriodicUpdate();///start the periodic update to get all the avatars and signs
        console.log("CC- wellcomeDone: End");
    }

    startPeriodicUpdate() {
        return setInterval(() => {
            this.periodicUpdate()
            console.log('periodicUpdate sent');
        }, 1 * 60 * 1000);///9 instaed of 1
    }

    stopPeriodicUpdate() {
        if (this.periodicUpdateInterval) {
            clearInterval(this.periodicUpdateInterval);
            this.periodicUpdateInterval = null;
            console.log("CC- periodicUpdate: Stopped");
        } else {
            console.warn("CC- periodicUpdate: No periodic update interval to stop.");
        }
    }

    async periodicUpdate() {
        console.log("CC- periodicUpdate: Start");

        let result = await getData("getAllStatuses");
        console.log("CC- periodicUpdate: Received data", result);

        const signs = result.signs;
        const avatars = result.avatars;

        if (Array.isArray(signs)) {
            console.log(`CC- periodicUpdate: Processing ${signs.length} signs`);

            for (const sign of signs) {
                console.log("CC- periodicUpdate: Processing sign", sign);

                let currAvatar = this._avatarsArr.find(avatarObj => avatarObj.avatarID == sign.avatarID);

                if (!currAvatar) {
                    console.log(`CC- periodicUpdate: Avatar with ID ${sign.avatarID} not found in _avatarsArr. Getting free avatar...`);
                    currAvatar = await this.getFreeAvatar(sign.isMan);

                    if (!currAvatar) {
                        console.warn("CC- periodicUpdate: No free avatar found to add to the world.");
                        continue;
                    }
                    console.log("CC- periodicUpdate: Matching free avatar with sign", sign);
                    await currAvatar.matchUser(sign);
                } else {
                    console.log(`CC- periodicUpdate: Avatar found for ID ${sign.avatarID}. Setting state based on sign.isLoading`);
                    if (sign.isLoading) {
                        currAvatar.setState("loading");
                    } else {
                        currAvatar.setState("noChat");
                    }
                }
            }
        } else {
            console.warn("CC- periodicUpdate: No signs found or signs is not an array.");
        }

        if (this.myAvatar && this.myAvatar.ID) {
            console.log("CC- periodicUpdate: Checking if myAvatar is included in avatars");

            if (!avatars.some(item => item["avatarID"] === this.myAvatar.ID)) {
                console.log(`CC- periodicUpdate: myAvatar ID ${this.myAvatar.ID} not found in avatars. Sending safeSend`);
                await wsClient.safeSend({
                    action: 'createAvatar',
                    type: 'createAvatar',
                    avatarID: this.myAvatar.ID
                }, this.myAvatar.ID);
            }
        } else {
            console.warn("CC- periodicUpdate: myAvatar is not set or does not have an ID.");
        }

        if (Array.isArray(avatars)) {
            console.log(`CC- periodicUpdate: Processing ${avatars.length} avatars`);

            for (const avatarData of avatars) {
                console.log("CC- periodicUpdate: Processing avatarData", avatarData);

                let currAvatar = this._avatarsArr.find(avatarObj => avatarObj.avatarID == avatarData.avatarID);

                if (currAvatar) {
                    console.log(`CC- periodicUpdate: Found avatar in _avatarsArr with ID ${avatarData.avatarID}. Setting state to ${avatarData.status}`);
                    currAvatar.setState(avatarData.status);
                } else {
                    console.warn("CC- periodicUpdate: Avatar not found in _avatarsArr for ID:", avatarData.avatarID);
                }
            }
        } else {
            console.warn("CC- periodicUpdate: No avatars found or avatars is not an array.");
        }

        console.log("CC- periodicUpdate: End");
    }


    /*
        async periodicUpdate() {
            let result = await getData("getAllStatuses");/////get all the signs and avatars from the server////////////
            const signs = result.signs;
            const avatars = result.avatars;
            ///console.log("CC- periodicUpdate: " + JSON.stringify(signs));
            ///find avatars that not added to the world and add them (compare signs with _avatarsArr)
            if (Array.isArray(signs)) {
                for (const sign of signs) {
                    //console.log("CC- periodicUpdate: " + JSON.stringify(sign));
                    let currAvatar = this._avatarsArr.find(avatarObj => avatarObj.avatarID == sign.avatarID);
                    if (!currAvatar) {///if the avatar is not in the world
                        currAvatar = await this.getFreeAvatar(sign.isMan);///get a free avatar
                        if (!currAvatar) {
                            console.warn("No free avatar found to add to the world.");
                            continue;
                        }
                        await currAvatar.matchUser(sign);///match the user to the avatar
                    } else {
                        if (sign.isLoading) {
                            currAvatar.setState("loading");
                        } else {
                            currAvatar.setState("noChat");
                        }
                    }
                }
                ///compare signs to avatars and send websocket createAvatar message to the ones that are missing on avatars
    
            } else {
                console.warn("CC- periodicUpdate: No signs found or signs is not an array.");
            }
            ///if mayAvatar did not open websocket connection, yet - do it now
            if (this.myAvatar && this.myAvatar.ID) {
                if (!avatars.some(item => item["avatarID"] === this.myAvatar.ID)) {
                    await wsClient.safeSend({
                        action: 'createAvatar',
                        type: 'createAvatar',
                        avatarID: this.myAvatar.ID
                    }, this.myAvatar.ID);
                } else {
                    console.warn("CC- periodicUpdate: myAvatar is not set or does not have an ID.");
                }
            }
     
            ///for each avatar in avatars get the status from avatar.status and set it to the avatar with the same avatarID in the world
            if (Array.isArray(avatars)) {
                for (const avatarData of avatars) {
                    //console.log("CC- periodicUpdate: " + JSON.stringify(avatarData));
                    let currAvatar = this._avatarsArr.find(avatarObj => avatarObj.avatarID == avatarData.avatarID);
                    if (currAvatar) {
                        ///set the status of the avatar in the world
                        currAvatar.setState(avatarData.status);
                        ///if the avatar is loading, set it to loading
                   } else {
                        console.warn("CC- periodicUpdate: Avatar not found in _avatarsArr for ID: " + avatarData.avatarID);
                    }
                }
            } else {
                console.warn("CC- periodicUpdate: No avatars found or avatars is not an array.");
            }
            
    
        }
    */
    ///not in use
    filterByMatching(sourceArray, referenceArray, attributeKey) {
        ///filter the sourceArray by the IDs in the referenceArray based on the attributeKey
        ///return the items in sourceArray that have the same attributeKey value as in referenceArray
        const referenceIDs = new Set(referenceArray.map(item => item[attributeKey])); ///create a set of IDs from the reference array
        return sourceArray.filter(item => referenceIDs.has(item[attributeKey])); ///filter the source array by the IDs in the reference array
    }

    ///not in use
    getMissingAttributeValues(sourceArray, referenceArray, attributeKey) {
        ///get the values of the attributeKey from the sourceArray that are not in the referenceArray
        const referenceValues = new Set(referenceArray.map(item => item[attributeKey]));
        return sourceArray
            .map(item => item[attributeKey])
            .filter(value => !referenceValues.has(value));
    }

    getFreeAvatar(isMan) {
        ///get the first avatar that is not in use
        ///TODO: handel gender and all used condition
        let genderArray;
        genderArray = this._avatarsArr.filter(avatarObj => (avatarObj.avatarData.loadedIsMan == isMan) && (avatarObj.avatarData.isUsed == false));
        if (genderArray.length === 0) {///try on wrong gender
            genderArray = this._avatarsArr.filter(avatarObj => (avatarObj.avatarData.loadedIsMan == !isMan) && (avatarObj.avatarData.isUsed == false));
            console.warn("CC- getFreeAvatar: No free avatars found for the specified genger")
        }
        if (genderArray.length === 0) {///even on other gender no avatar
            console.log("CC- getFreeAvatar: no free avatars");
            return false;
        }
        let avatarObj = genderArray[0];///get the first avatar that is not in use
        avatarObj.avatarData.isUsed = true; ///set the avatar as used
        //console.log("CC- getFreeAvatar: found free avatar: " + avatarObj.avatarData.num);
        return avatarObj;
    }
    ///if all avatars are in use return the first one
    //return this._avatarsArr[0].avatar;


    //////////////////FROM CHAT TO THE SERVER//////////////////////////////////

    /**
     * create chat on my self following user action and Sends a chat request to server
        * ask server to send a  chatStarted  to all avatars
        * the fromAvatarID is the ID of the avatar that is asking for the chat (this.myAvatar.ID)
        * the toAvatarID is the ID of the avatar that the chat is requested to
        * serve will use the fromAvatarID and toAvatarID to send the chatStarted to the right avatars and to set the chatID
     *
     * @param {string} toID - The ID of the avatar to send the chat request to (toID).
     */
    async chatRequest(toID) {
        let toAvatar = this.idToAvatar(toID)
        if (this.currChat) {
            console.log("CHAT- chatRequest: already in chat");
            return;
        }
        this.allowPointer = false;///disable the pointer to avoid clicks
        if (!toID) {
            console.error("CHAT- chatRequest: toID is not defined");
            return;
        }
        /////////checkAndUpdate///////
        let checkMessage = {
            "key": toID,
            "checkAttribute": "status",
            "requiredValue": "noChat",
            "newValue": "inChat"
        }

        const result = await postData("checkAndUpdate", checkMessage)
        if (!result) {
            console.warn("Failed to receive a response from server.");
            return;
        }

        console.log("Server message:", result.message);
        ///if the checkAndUpdate returned "refused" it means that the other avatar is already in a chat         
        if (result.message === "refused") {
            console.error("CHAT- chatRequest: refused");
            //this.msg = new MessageScreen(this, "הצעה זו נדחתה", 'error');///show message that the chat is refused
            toAvatar.setState("refuseChat");///set the state of the avatar to noChat
            this.allowPointer = true;///enable the pointer to allow clicks again
            return;
        }

        ///////////end of checkAndUpdate///////

        ///we verified noChat state, so we can send the websocket chat request
        /// HTTP set the status on server (only)
        console.log("CHAT- chatRequest sent");
        this.currChat = new Chat(this.myAvatar, toAvatar, this);

        await wsClient.safeSend({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'chatRequest',
            chatID: this.currChat.chatID,
            fromAvatarID: this.myAvatar.ID, ///my Avatar is this._avatarsArr[0].avatar
            toAvatarID: toID
        }, this.myAvatar.ID + this.currChat.chatID);///send the request to the server with my avatar ID
        this.stopPeriodicUpdate();///stop the periodic update to avoid conflicts with the chat
    }

    /**
      * Asynchronously removes an avatar from the world.
      * remove the avatar from the _avatarsArr
      * dispose the avatar mesh
      *
      * @param {number} avatarID - The ID of the avatar to be removed.
      * @returns {Promise<void>} A promise that resolves when the avatar has been removed.
      */

    /**from button on the chat window to send the message to the server*/
    dealDoneSelected(chatID, fromAvatarID, toAvatarID) {
        this.doDealSelected(chatID, fromAvatarID, toAvatarID, "dealDone");
    }

    /**from button on the chat window to send the message to the server*/
    dealNotDoneSelected(chatID, fromAvatarID, toAvatarID) {
        this.doDealSelected(chatID, fromAvatarID, toAvatarID, "noDeal");
    }

    async doDealSelected(chatID, fromAvatarID, toAvatarID, answer) {
        let dest_id///send to the other avatar
        let sender_id//
        if (this.myAvatar.ID == fromAvatarID) {
            dest_id = toAvatarID;
            sender_id = fromAvatarID;
        } else {
            dest_id = fromAvatarID;
            sender_id = toAvatarID
        }
        console.log("CHAT-doDealSelected");
        await wsClient.safeSend({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'dealResult',
            chatID: chatID,
            fromAvatarID: fromAvatarID,///this.myAvatar.ID, ///my Avatar is this._avatarsArr[0].avatar
            toAvatarID: toAvatarID,
            senderAnswer: answer,
            senderID: this.myAvatar.ID,
            destID: dest_id,
            senderID: sender_id
        }, this.myAvatar.ID + chatID);

    }

    ///send all the text with the new line to the server (that will send it to the other avatar)
    async updateChat(chatID, fromAvatarID, toAvatarID, text) {
        let avatar_id///send to the other avatar
        if (this.myAvatar.ID == fromAvatarID) {
            avatar_id = toAvatarID;
        } else {
            avatar_id = fromAvatarID;
        }
        await wsClient.safeSend({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'updateChat',
            chatID: chatID,
            chatText: text,
            destID: avatar_id
        }, this.myAvatar.ID + chatID);
    }

    async closeChat(avatarFromID, avatarToID) {
        if (this.currChat) {
            await wsClient.safeSend({
                action: 'startChat',///wrong route name for message to any message to cs_chat lambda
                type: 'chatEnd',
                fromAvatarID: avatarFromID,
                toAvatarID: avatarToID,
                chatID: this.currChat.chatID
            }, this.myAvatar.ID + this.currChat.chatID);
            patchData(avatarFromID, "status", "noChat")
            patchData(avatarToID, "status", "noChat")
            this.periodicUpdate();
            this.startPeriodicUpdate();///stop the periodic update to avoid conflicts with the chat
        } else {
            console.log("CHAT- closeChat: no chat to close");
            this.allowPointer = true;
        }
        //this.allowPointer = true;///enable the pointer to allow clicks again ///moved to chatEnded
    }

    ///////////////////FROM SERVER TO WORLD/////////////////////////////////////


    ///got from server when chat requested
    ///if requested from me I open a chat object. call it currChat
    ///toAvatarID is alwayes the ID of the avatar that clicked
    ///fromAvatarID is the ID of the avatar that request the chat
    chatStarted(fromAvatarID, toAvatarID) {
        const chatID = `${fromAvatarID}_${toAvatarID}`;
        if (this.currChat) {
            console.log("CHAT- chatStarted: already in chat");
            if (this.currChat.chatID === chatID) {
                console.log("CHAT- chatStarted: already in chat with the same ID");
                return;
            }
            ///close current chat????????
            //this.chatEnded(fromAvatarID, toAvatarID);///close the current chat
            return;
        }

        console.log("CHAT- chatStarted on world");
        let toAvatar = this.idToAvatar(toAvatarID);
        let fromAvatar = this.idToAvatar(fromAvatarID);
        if (this.myAvatar.ID == fromAvatarID) {///I sent the request
            this.idToAvatar(toAvatarID).setState("myChat");//on myworld sign my pair
        }
        if (this.myAvatar.ID == toAvatarID) {///I got the request
            this.idToAvatar(fromAvatarID).setState("myChat");///on myworld sign my pair
            ///create the chat object in my world do not update the server (the server already know about the chat)
            this.currChat = new Chat(fromAvatar, toAvatar, this);
            this.allowPointer = false;///disable the pointer to avoid clicks
        }
        if (this.myAvatar.ID != fromAvatarID && this.myAvatar.ID != toAvatarID) {///Im not one of the one in this chat
            ///sign the pair in my world
            fromAvatar.setState("inChat");
            toAvatar.setState("inChat");
        }
    }

    idToAvatar(id) {
        let avatarObj = this._avatarsArr.find(avatarObj => avatarObj.avatarID == id);
        return avatarObj;
    }
    //////only for the pair avatar  
    chatUpdated(chatText, destID) {
        if (this.myAvatar.ID == destID) {
            let currText = this.currChat.getText();
            if (this.countLines(currText) < this.countLines(chatText)) {
                this.currChat.updateText(chatText)
            } else {
                console.log("new text is shorter than the current text, not updating.");
            }
        }
    }

    countLines(str) {
        if (!str) return 0;
        // Split on any common newline sequence
        const lines = str.split(/\r\n|\r|\n/);
        return lines.length;
    }

    ///from the server:
    //dealResult(fromAvatarID, toAvatarID, fromResult, toResult) {
    dealResult(fromAvatarID, toAvatarID, senderAnswer, destAnswer, senderID, destID) {
        console.log("CHAT- dealResult on world dest: " + destAnswer + " sender " + senderAnswer);
        //signData.action = 'dealNotDone';
        if (this.myAvatar.ID == fromAvatarID || this.myAvatar.ID == toAvatarID) {
            ///if the chat is not in my world I will not handle the message
            if (destAnswer == senderAnswer) {
                if (destAnswer == "dealDone") {
                    this.currChat.setChatState("done");
                    console.log("CHAT- dealDone on world");
                } else {
                    this.currChat.setChatState("notDone")
                    console.log("CHAT-dealNotDone on world");
                }
            } else { ///the other avatar answered differently
                if (this.myAvatar.ID == senderID && destAnswer == null) {///I sent and he didnt answer yet
                    ///write in the chat object in my world to wait and then click again
                    this.currChat.setChatState("wait");
                    console.log("CHAT-dealWait on world");
                }
                if (destAnswer == "noDeal") {
                    if (this.myAvatar.ID == senderID) { ///I sent yes, he refused
                        ///write in the chat object in my world that the other accepted so click close, you may try to talk with him again
                        this.currChat.setChatState("refused");
                        console.log("CHAT-dealRefused on world");
                    }
                    if (this.myAvatar.ID == destID) { ///He sent no, I accepted
                        ///write in the chat object in my world that the other accepted so click close, you may try to talk with him again
                        this.currChat.setChatState("otherAccepted");
                        console.log("CHAT-otherAccepted on world");
                    }
                }
                if (destAnswer == "dealDone") {
                    if (this.myAvatar.ID == senderID) { ///I sent yes, he accepted
                        ///write in the chat object in my world that the other accepted so click close, you may try to talk with him again
                        this.currChat.setChatState("otherAccepted");
                        console.log("CHAT-dealRefused on world");
                    }
                    if (this.myAvatar.ID == destID) { ///I sent no, he accepted
                        ///write in the chat object in my world that the other accepted so click close, you may try to talk with him again
                        this.currChat.setChatState("refused");
                        console.log("CHAT-otherAccepted on world");
                    }
                }

            }
        }
    }


    chatEnded(fromAvatarID, toAvatarID) {
        console.log("CHAT>>>- chatEnded on world from:" + fromAvatarID + "to: " + toAvatarID + "my: " + this.myAvatar.ID);
        if (this.currChat && (this.myAvatar.ID == fromAvatarID || this.myAvatar.ID == toAvatarID)) {
            this.currChat.dispose();
            this.currChat = null;
        }
        /////TODO
        //if ( this.myAvatar.ID == fromAvatarID ) {
        //    this.idToAvatar(toAvatarID).setState("afterChat");///on myworld sign my pair to prevent chat again
        //}
        ///sign the pair in my world
        this.idToAvatar(fromAvatarID).setState("noChat");
        this.idToAvatar(toAvatarID).setState("noChat");
        this.allowPointer = true;///disable the pointer to allow clicks
    }

    doAvatarLeft(avatarID) {
        console.log("CHAT>>>- avatarLeft on world: " + avatarID);
        let avatarObj = this._avatarsArr.find(avatarObj => avatarObj.avatarID == avatarID);
        if (avatarObj) {
            avatarObj.setDone();
        }
    }

    doSetStatus(ID, status) {
        console.log("CHAT>>>- doSetStatus on world: " + ID);
        let avatarObj = this._avatarsArr.find(avatarObj => avatarObj.avatarID == ID);
        if (avatarObj) {
            avatarObj.setState(status);
        }
    }




    ///function to safely stringify an object, skipping the myWorld property
    /**
     * Safely stringify an object, skipping the 'myWorld' property.
     * This is useful for debugging purposes to avoid circular references.
     *
     * @param {Object} obj - The object to stringify.
     * @returns {string} - The JSON string representation of the object, excluding 'myWorld'.
     */
    safeStringifySkipMyWorld(obj) {///for debug
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (key === "myWorld") return undefined; // Skip this property

            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            return value;
        }, 2); // Pretty-print with 2 spaces
    }
}
