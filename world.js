//var scene = window.scene;
///my Avatar is this._avatarsArr[0].avatar
class World {
    constructor(scene) {
        this._avatarsArr = [];
        this._wellcome = new Wellcome(this);
    }

    ///will be called by Message
    wellcomeDone(signData) {
        signData.action = 'createAvatar';
        console.log("wellcomeDone: ");
        //console.log(  signData);
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

        let avatarObj = {
            avatar: new Avatar(signData.avatarID, avatarDetails.avatarURL, this),
            avatarID: signData.avatarID
        };
        this._avatarsArr.push(avatarObj);
        await avatarObj.avatar.initAvatar(avatarDetails, signData, scene);
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
            console.log(`avatarId: `);
            console.log(currentAvatarId);
            ///verify the avatar is not already in the world   
            if (this._avatarsArr.find(avatarObj => avatarObj.avatarID == currentAvatarId)) {
                console.log("avatar already in the world");
                continue;
            }
            ///find the signData of the avatar;
            let avatarSignData = signDataArray.find(signData => signData.avatarID == currentAvatarId);
            console.log(`avatarSignData for avatarID ${currentAvatarId}:`, avatarSignData);
            if (avatarSignData) { ///if the avatar is not in the signDataArray we will not add it to the world
                await this.addAvatar2World(avatar, avatarSignData, scene);
            }
        }
    }
    
    /**
     * Sends a chat request to another avatar.
     * ask server to send a chat request to the avatar with the toID
     * the fromAvatarID is the ID of the avatar that is asking for the chat
     * ask the server to notify all workds that the avatar with the toID has a chat request
     *
     * @param {string} toID - The ID of the avatar to send the chat request to.
     */
    chatrequest(toID) {
        new Chat (this._avatarsArr[0].avatar.ID, toID, this);
        /*
        socket.send(JSON.stringify({
            action: 'chatRequest',
            toAvatarID: toID,
            fromAvatarID: this._avatarsArr[0].avatar.ID ///my Avatar is this._avatarsArr[0].avatar
        }));
        */
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


}