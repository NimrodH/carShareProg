//var scene = window.scene;

class World {
    constructor(scene) {
        this._avatarsArr = [];
        /// next line is for test. it will run well if we run onServerConnect from index.html
        ///and set _avatarsURLs in index.html as test replacment to the server data
        //this.initAvatars(scene) ///for test the function is now commented
        this._wellcome = new Wellcome(this);
    }

    ///will be called by Message
    wellcomeDone(signData) {
        signData.action = 'createAvatar';
        console.log( "wellcomeDone: " );
        //console.log(  signData);
        socket.send(JSON.stringify(signData));
    }
    /**
     * Asynchronously adds an avatar to the world.
     *
     * @param {string} ID - The unique identifier for the avatar.
     * URL & position given by the server that take it from boys or girls tabl
     * @param {string} URL - The URL to the avatar's resources.
     * @param {number} x - The x-coordinate for the avatar's initial position.
     * @param {number} y - The y-coordinate for the avatar's initial position.
     * @param {number} z - The z-coordinate for the avatar's initial position.
     * signData we got from the welcome message & send to server and the server now return it to us 
     * @param {Object} signData - Additional data required for the avatar's initialization.
     * @param {Object} scene - The scene object where the avatar will be added.
     * @returns {Promise<void>} A promise that resolves when the avatar has been added and initialized.
     */
    async addAvatar2World(avatarDetails, signData, scene ) {
        //ID, URL, x, y, z, signData,
        
        let avatarObj = {
            avatar: new Avatar(avatarDetails.num, avatarDetails.URL),
            avatarID : avatarDetails.num
        };
        this._avatarsArr.push(avatarObj);
        await avatarObj.avatar.initAvatar(avatarDetails, signData, scene);
    }

    async addExistingAvatars( existingAvatarsAry) {
        ///ID, URL, x, y, z, signData, scene
        existingAvatarsAry.forEach(avatar => {
             addAvatar2World(avatarDetails, signData, scene )   
        });
    }

///for test
/*
    async initAvatars(scene){

        this._avatarsArr[0] = {
            //avatar: new Avatar(this._avatarsURLs[0]),
            avatar: new Avatar(_avatarsURLs[0]),
            avatarID : "A1"
        };

        await this._avatarsArr[0].avatar.initAvatar(1, 0, 0, scene);
        this._avatarsArr[1] = new Avatar(this._avatarsURLs[1]);
        await this._avatarsArr[1].initAvatar(2, 0, 0, scene);
        this._avatarsArr[2] = new Avatar(this._avatarsURLs[2]);
        await this._avatarsArr[2].initAvatar(0, 0, -3, scene);
    }
*/
}