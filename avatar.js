

class Avatar {
 
    constructor(avatarID, avatarURL, world) {
        this.myWorld = world;
        this.avatarURL = avatarURL;
        this.ID = avatarID;
    }

    async initAvatar( avatarDetails, signData, scene) {
        const planeSize = 0.85;
        const signX = 0;
        const signY = 0.55;
        const signZ = 0.18;
        this.avatarMesh = await this.createAvatarMesh(this.avatarURL, scene);
        //this.avatarMesh.alpha = 0.5;
        this.frontSign = new AvatarMessage(planeSize, signX, signY, signZ, signData, this)
        this.avatarMesh.position = new BABYLON.Vector3(avatarDetails.x, avatarDetails.y, avatarDetails.z);
        ///TODO:set position by avatarDetails.targetX, targetY, targetZ
    }

    async createAvatarMesh(avatarURL, scene) {
        console.log("avatarURL: " + avatarURL)
       await BABYLON.SceneLoader.AppendAsync("", avatarURL, scene);
        let avatarMesh = (scene.meshes[scene.meshes.length - 1]).parent;
        return avatarMesh.parent;
    }

    chatRequest() {
        this.myWorld.chatrequest(this.ID);
        console.log("chatRequest on avatar: ");
    }
}