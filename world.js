//var scene = window.scene;
///my Avatar is this._avatarsArr[0].avatar
class World {
    constructor(scene) {
        this._avatarsArr = [];///contains objects whith the avata, id and name
        this._wellcome = new Wellcome(this);
        this.myAvatar;///the avatar of the user that saved inside the _avatarsArr[0].avatar
    }

    ///will be called by Message
    wellcomeDone(signData) {
        signData.action = 'createAvatar';
        //console.log("wellcomeDone: ");
        ////console.log(  signData);
        socket.send(JSON.stringify(signData));
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
    async addAvatar2World(avatarDetails, signData, scene) {
        //ID, URL, x, y, z, signData,
        //console.log("avatarDetails: ");
        //console.log(avatarDetails);
        let avatarObj = {
            avatar: new Avatar(signData.avatarID, avatarDetails.avatarURL, this),
            avatarID: signData.avatarID,
            avatarName: signData.userName
        };
        this._avatarsArr.push(avatarObj);
        await avatarObj.avatar.initAvatar(avatarDetails, signData, scene);
        ///hide avatar if its the first one
        ///when we will run on all avatars we will start from 1 (not 0)
        if (this._avatarsArr.length == 1) {
            ///hide the my avatar
            this.myAvatar = avatarObj.avatar;
            this.myAvatar.avatarMesh.setEnabled(false);
            console.log("this.myAvatar");
            console.log(this.myAvatar);
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
            let currentAvatarId = avatar.avatarID;
            ////console.log(`avatarId: `);
            ////console.log(currentAvatarId);
            ///verify the avatar is not already in the world   
            if (this._avatarsArr.find(avatarObj => avatarObj.avatarID == currentAvatarId)) {
                //console.log("avatar already in the world");
                continue;
            }
            ///find the signData of the avatar;
            let avatarSignData = signDataArray.find(signData => signData.avatarID == currentAvatarId);
            ////console.log(`avatarSignData for avatarID ${currentAvatarId}:`, avatarSignData);
            if (avatarSignData) { ///if the avatar is not in the signDataArray we will not add it to the world
                await this.addAvatar2World(avatar, avatarSignData, scene);
            }
        }
    }
    
    /**
     * create chat on my self following user action and Sends a chat request to server
        * ask server to send a  chatStarted  to all avatars
        * the fromAvatarID is the ID of the avatar that is asking for the chat (this.myAvatar.ID)
        * the toAvatarID is the ID of the avatar that the chat is requested to
        * serve will use the fromAvatarID and toAvatarID to send the chatStarted to the right avatars and to set the chatID
     *
     * @param {string} toID - The ID of the avatar to send the chat request to (toID).
     */
    chatRequest(toID) {
        this.currChat = new Chat (this._avatarsArr[0].avatar.ID, toID, this);
       
        socket.send(JSON.stringify({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'chatRequest',
            chatID: this.currChat.chatID,
            fromAvatarID: this.myAvatar.ID, ///my Avatar is this._avatarsArr[0].avatar
            toAvatarID: toID
        }));      
    }
///got from server when chat requested
///if requested from me I open a chat object. call it currChat
///toAvatarID is alwayes the ID of the avatar that clicked
///fromAvatarID is the ID of the avatar that request the chat
    chatStarted(fromAvatarID, toAvatarID) {
        console.log("startChat on world");
        if (this.myAvatar.ID == fromAvatarID) {///I sent the request
            this.idToAvatar(toAvatarID).setState("myChat");//on myworld sign my pair
        }
        if (this.myAvatar.ID == toAvatarID) {///I got the request
            this.idToAvatar(fromAvatarID).setState("myChat");///on myworld sign my pair
            ///create the chat object in my world do not update the server (the server already know about the chat)
            this.currChat = new Chat (fromAvatarID, toAvatarID, this);
        }
        if (this.myAvatar.ID != fromAvatarID && this.myAvatar.ID != toAvatarID) {///Im not one of the one in this chat
            ///sign the pair in my world
            this.idToAvatar(fromAvatarID).setState("inChat");
            this.idToAvatar(toAvatarID).setState("inChat");
        }
    }

    idToAvatar(id) {
        let avatarObj = this._avatarsArr.find(avatarObj => avatarObj.avatarID == id);
        return avatarObj.avatar;
    }
    
    /**
     * Asynchronously removes an avatar from the world.
     * remove the avatar from the _avatarsArr
     * ask the server to notify all worlds that the avatar has been removed
     *
     * @param {number} avatarID - The ID of the avatar to be removed.
     * @returns {Promise<void>} A promise that resolves when the avatar has been removed.
     */
    async removeAvatarFromWorld(avatarID) { ///remove the avatar from the _avatarsArr
        let index = this._avatarsArr.findIndex(avatarObj => avatarObj.avatarID == avatarID);
        if (index > -1) {
            this._avatarsArr.splice(index, 1);
        }
        socket.send(JSON.stringify({
            action: 'removeAvatar',
            avatarID: avatarID
        }));
    } 
    
    /**from button on the chat window to send the message to the server*/
    dealDoneSelected(chatID) {
        //signData.action = 'dealDone';
        console.log("dealDoneSelected on world");
        this.currChat.dispose();
        this.currChat = null;
        ////console.log(  signData);
        //socket.send(JSON.stringify(signData));
        ///TODO: send to server that the chat is done
        socket.send(JSON.stringify({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'chatRequest',
            chatID: this.currChat.chatID,
            fromAvatarID: this.myAvatar.ID, ///my Avatar is this._avatarsArr[0].avatar
            toAvatarID: toID
        }));   
    }

    /**from button on the chat window to send the message to the server*/
    dealNotDoneSelected(chatID) {
        //signData.action = 'dealNotDone';
        console.log("dealNotDoneSelected on world");
        this.currChat.dispose();
        this.currChat = null;
        ////console.log(  signData);
        //socket.send(JSON.stringify(signData));
        ///TODO: send to server that the chat is Not done
    }

    /**from the server:
     *  to close chat on toAvatar
     *  sign button on all worlds
     * notify if one aprove and other not */
    dealResult(fromAvatarID, toAvatarID, fromResult, toResult) {
        console.log("dealResult on world");
        //signData.action = 'dealNotDone';
        if (toResult == fromResult) {
            if (this.myAvatar.ID == fromAvatarID || this.myAvatar.ID == toAvatarID) {           
                this.currChat.dispose();
                this.currChat = null;
            }
            this.myAvatar.setState("noChat");
        } else {
            ///one aprove and the other not or one dont answer yet
            ///one not answer yet
            if (this.myAvatar.ID == fromAvatarID && toResult == none || this.myAvatar.ID == toAvatarID && fromResult == none) {
                ///write in the chat object in my world to wait and then click again
                this.currChat.setState("wait");
            }
            if (this.myAvatar.ID == fromAvatarID && toResult == "noDeal") {
                ///write in the chat object in my world that the other didnt accept so click close, you may try to talk with him again
                this.currChat.setState("refused");
            }
            
        }
        ////console.log(  signData);
        //socket.send(JSON.stringify(signData));
    }

    ///send all the text with the new line to the server (that will send it to the other avatar)
    updateChat(charID, fromAvatarID, toAvatarID, text) {
        let avatar_id///send to the other avatar
        if (this.myAvatar.ID == fromAvatarID) {
            avatar_id = toAvatarID;
        } else {
            avatar_id = fromAvatarID;
        }
        socket.send(JSON.stringify({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'updateChat',
            chatID: charID,
            chatText: text,
            destID: avatar_id
        }));  
    }

    closeChat() {
        this.currChat.dispose();
        this.currChat = null;
    }
}