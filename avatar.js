

class Avatar {
 
    constructor(avatarID, avatarURL) {
        this.URL = avatarURL;
        this.ID = avatarID;
     }

    async initAvatar( x, y, z, signData, scene) {
        const planeSize = 0.85;
        const signX = 0;
        const signY = 0.55;
        const signZ = 0.18;
        this.avatarMesh = await this.createAvatarMesh(this.URL, scene);
        this.frontSign = new AvatarMessage(planeSize, signX, signY, signZ, signData, this.avatarMesh)
        this.avatarMesh.position = new BABYLON.Vector3(x, y, z);
    }

    async createAvatarMesh(avatarURL, scene) {
        console.log("avatarURL: " + avatarURL)
       await BABYLON.SceneLoader.AppendAsync("", avatarURL, scene);
        let avatarMesh = (scene.meshes[scene.meshes.length - 1]).parent;
        return avatarMesh.parent;
    }


}