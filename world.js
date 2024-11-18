//var scene = window.scene;

class World {
    constructor(scene) {
        this._avatarsArr = [];
         ///this.initAvatars(scene) ///run as test and work well
         this._wellcome = new Wellcome(this);
    }

    ///will be called by Message
    wellcomeDone(signData) {
        signData.action = 'createAvatar';
        console.log( "wellcomeDone: " + signData);
        socket.send(JSON.stringify(signData));
    }
    /// called by the serve 
    ///URL & position given by the server that take it from boys or girls table (and delete it from there
    ///signData we got from the welcome message & sent to server and the server now return it to us
    async addAvatar2World(ID, URL, x, y, z, signData, scene ) {
        let avatarObj = {
            avatar: new Avatar(ID, URL),
            avatarID : ID
        };
        this._avatarsArr.push(avatarObj);
        await avatarObj.avatar.initAvatar(x, y, z, signData, scene);
    }

    async addExistingAvatars( existingAvatarsAry) {
        ///ID, URL, x, y, z, signData, scene
        existingAvatarsAry.forEach(avatar => {
             addAvatar2World(avatar.ID, avatar.URL,avatar.x,avatar.y, avatar.z, avatar.signData, scene )   
        });
    }

/* old ///for test

    async initAvatars(scene){

        this._avatarsArr[0] = {
            avatar: new Avatar(this._avatarsURLs[0]),
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