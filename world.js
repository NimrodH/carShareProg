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
    startChat(fromAvatarID, toAvatarID) {
        console.log("startChat on world");
        if (this.myAvatar.ID == fromAvatarID) {///do it to the pair
            this.idToAvatar(toAvatarID).setState("myChat");
        }
        if (this.myAvatar.ID == toAvatarID) {
            this.idToAvatar(fromAvatarID).setState("myChat");///do it to the pair
            this.currChat = new Chat (fromAvatarID, toAvatarID, this);
            ///TODO: to replace to and from??? so allways the sende of message wil be the fromAvatarID??
            ///if we will do it we need to fix the server to send the message to the right avatar?
        }
        if (this.myAvatar.ID != fromAvatarID && this.myAvatar.ID != toAvatarID) {///do it to others
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
    
    dealDone(chatID) {
        //signData.action = 'dealDone';
        console.log("dealDoneon world");
        this.currChat.dispose();
        this.currChat = null;
        ////console.log(  signData);
        //socket.send(JSON.stringify(signData));
        ///TODO: send to server that the chat is done
    }

    dealNotDone(chatID) {
        //signData.action = 'dealNotDone';
        console.log("dealNotDoneon world");
        this.currChat.dispose();
        this.currChat = null;
        ////console.log(  signData);
        //socket.send(JSON.stringify(signData));
        ///TODO: send to server that the chat is Not done
    }

    updateChat(fromAvatarID, toAvatarID, text) {
        ///TODO: handle following
        console.log("updateChat");
        socket.send(JSON.stringify({
            action: 'startChat',///wrong route name for message to any message to cs_chat lambda
            type: 'updateChat',
            chatID: this.currChat.chatID,
            fromAvatarID: this.myAvatar.ID, ///my Avatar is this._avatarsArr[0].avatar
            toAvatarID: toAvatarID,
            chatText: text
        }));  
    }
}