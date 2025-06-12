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
        ///TODO:
        ///show message: "loading"
        const loadingMessage = `המתן - טוען אווטרים
כאשר שלט זה  ייסגר חלק מהאווטרים יציגו 
שלט עם פרטי הנסיעה המעניינים אותם
ניתן יהיה ללחוץ על הכפתור בשלט
 כדי לקיים שיחת צ'אט עם אווטר רלוונטי`;
        this.msg = new MessageScreen(this, loadingMessage, 'info');
        ///send HTTP request to create the avatar 
        postData("addAvatar", signData);
        ///save myAvatar details (no need to object avatar for my avartar))
        this.myAvatar.Id = signData.avatarID;///save the avatarID of my avatar
        this.myAvatar.name = signData.name;///save the avatarID of my avatar
        ///loop avatarsDataArray to create (new Avatar) and then load (use acreateAvatarMesh and placeAvatr from Avatar.js) all avatar images
        let iterationText = 1;
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
        ///hide message "loading"
        this.msg.clearInstance();///clear the message screen
        this.msg = null;///clear the message screen

        this.allowPointer = true;
        ///start update by ping
        let signs =  getData("getAllStatuses");
        console.log("CC- getAllStatuses: " + JSON.stringify(signs));
        //return signs; ///return the signs to the caller
    }

readUpdateStatus() {
    ///read the update status from the server
    get()
}

    /**
     * Asynchronously adds an avatar to the world.
     * create the acvatar as object and add it to the _avatarsArr
     * in the costructor set the avatarURL and the avatarID
     * and then call the avatar.initAvatar to create the mesh and the sign
     *
     * @param {Object} avatarDetails - An object containing the avatar details (already created before the current).
     * @param {Object} signData - An object containing the sign data for the avatar.
     * @param {Object} scene - The scene object where the avatar will be added.
     * @returns {Promise<void>} A promise that resolves when the avatar has been added and initialized
     */
    async addAvatar2World(avatarDetails, signData, isMe, scene) {
        //ID, URL, x, y, z, signData,
        //console.log("avatarDetails: ");
        //console.log(avatarDetails);
        if (this._avatarsArr.find(a => a.avatarID === signData.avatarID)) {
            //console.log("CC- avatar not missing in the world: " + id);
            return;
        }
        let avatarObj = {
            avatar: new Avatar(signData.avatarID, avatarDetails.avatarURL, this),
            avatarID: signData.avatarID,
            avatarName: signData.userName
        };
        //console.log("avatarObj: ");
        //console.log(avatarObj);
        this._avatarsArr.push(avatarObj);
        const isLocal = (signData.avatarID === this.myAvatarID);
        if (isLocal) {
            this.myAvatar = avatarObj.avatar;
        }
        await avatarObj.avatar.initAvatar(avatarDetails, signData, scene);
        //console.log("after avatarObj.avatar.initAvatar");
        ///hide avatar if its the first one
        ///when we will run on all avatars we will start from 1 (not 0)

        if (isMe) {
            ///this is my avatar
            //console.log("this is my avatar: " + avatarObj.avatarID);
            this.myAvatar = avatarObj.avatar;
            this.myAvatar.avatarMesh.setEnabled(false);
            //console.log("this.myAvatar");
            //console.log(this.myAvatar);
        }
    }

    /**
     * Asynchronously adds multiple avatars to the world.
     *
     * @param {Array<Object>} avatarsArray - An array of objects containing the avatar details (already created before the current).
     * @param {Array<Object>} signDataArray - An array of objects containing the sign data for each avatar.
     * @param {Object} scene - The scene object where the avatars will be added.
     * @returns {Promise<void>} A promise that resolves when all avatars have been added and initialized.
     */
    async addMissingAvatars2World(avatarsArray, signDataArray, scene) {
        for (const avatar of avatarsArray) {
            ////////////////let currentAvatarId = avatar.avatarID;
            const id = avatar.avatarID;///////////
            ////console.log(`avatarId: `);
            ////console.log(currentAvatarId);
            ///verify the avatar is not already in the world   
            if (this._avatarsArr.find(a => a.avatarID === id)) {
                //console.log("CC- avatar not missing in the world: " + currentAvatarId);
                continue;
            }
            //TODO: verify that avatar ibs not myAvatar
            //("this.myAvatar" );
            //console.log(this );
            if (this.myAvatar && this.myAvatar.ID === id) {
                //if (this.myAvatar.avatarID == currentAvatarId) { //just tried
                //console.log("avatar is my avatar");
                continue;
            }

            /******
                        ///find the signData of the avatar;
                        let avatarSignData = signDataArray.find(signData => signData.avatarID == currentAvatarId);
                        ////console.log(`avatarSignData for avatarID ${currentAvatarId}:`, avatarSignData);
                        if (avatarSignData) { ///if the avatar is not in the signDataArray we will not add it to the world
                            //console.log("avatar:");
                            
                            await this.addAvatar2World(avatar, avatarSignData, false, scene);
                            console.log("CC- missing avatar added.  ID: " + currentAvatarId);
                        }
            
            *****/
            const sign = signDataArray.find(s => s.avatarID === id);
            if (sign) {
                await this.addAvatar2World(avatar, sign, false, scene);
            }
        }
    }
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
        if (this.currChat) {
            console.log("CHAT- chatRequest: already in chat");
            return;
        }
        this.allowPointer = false;///disable the pointer to avoid clicks
        console.log("CHAT- chatRequest sent");
        let toAvatar = this.idToAvatar(toID)
        this.currChat = new Chat(this._avatarsArr[0].avatar, toAvatar, this);

        await wsClient.safeSend({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'chatRequest',
            chatID: this.currChat.chatID,
            fromAvatarID: this.myAvatar.ID, ///my Avatar is this._avatarsArr[0].avatar
            toAvatarID: toID
        });
    }

    /**
      * Asynchronously removes an avatar from the world.
      * remove the avatar from the _avatarsArr
      * dispose the avatar mesh
      *
      * @param {number} avatarID - The ID of the avatar to be removed.
      * @returns {Promise<void>} A promise that resolves when the avatar has been removed.
      */
    /*
async removeAvatarFromWorld(avatarID) { ///remove the avatar from the _avatarsArr
    let avatarObj = this._avatarsArr.find(avatarObj => avatarObj.avatarID == avatarID);
    if (avatarObj) {
        avatarObj.avatar.setDone();
    }

    if (avatarObj) {
        avatarObj.avatar.dispose();
        avatarObj.avatar = null;
    }
    let index = this._avatarsArr.findIndex(avatarObj => avatarObj.avatarID == avatarID);
    if (index > -1) {
        this._avatarsArr.splice(index, 1);
    }
    
    console.log("CHAT- removeAvatarFromWorld: " + avatarID);
}
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
        });

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
        });
    }

    async closeChat(avatarFromID, avatarToID) {
        if (this.currChat) {
            await wsClient.safeSend({
                action: 'startChat',///wrong route name for message to any message to cs_chat lambda
                type: 'chatEnd',
                fromAvatarID: avatarFromID,
                toAvatarID: avatarToID,
                chatID: this.currChat.chatID
            });
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
        return avatarObj.avatar;
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
            avatarObj.avatar.setDone();
        }
    }
}