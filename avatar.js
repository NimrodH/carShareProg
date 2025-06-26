

class Avatar {
    constructor(avatarData, world) {
        this.myWorld = world;
        this.avatarData = avatarData; ///The data related to the avatar (differ then the user own it) see avatarsDataArray
        this.userData = {};///will be filled with data from signdata including name and avatarID (see debugUsersArray)
        this.statusData = {}; ///will be updated with the status of the avatar (noChat, myChat, inChat...)
        this.avatarMesh = null; ///the mesh of the avatar
        this.frontSign = null; ///the sign in front of the avatar (AvatarMessage)
        this.alreadyTalked = false;

        //console.log("Avatar ID: " + this.ID);
    }
    ///getters for the avatar data for old code compatibility
    get ID() {
        console.log("get avatar ID used")
        return this.userData.avatarID;
    }
    get userName() {
        return this.userData.userName;
    }
    get avatarID() {
        return this.userData.avatarID;
    }

    async matchUser(signData) {
        const planeSize = 0.85;
        const signX = 0;
        const signY = 0.55;
        const signZ = 0.18;
        this.userData = signData; ///The data related to the user (the one who own the avatar)
        //this.userName = signData.userName;
        //console.log("avatarMesh:", this.avatarMesh);
        if (signData.avatarID[0] == "A") {
            this.avatarMesh.getChildMeshes().forEach(child => {
                //child.setEnabled(false); // This will completely disable the mesh
                // Alternatively, you can use:
                child.visibility = 0;
            });
        }
        //console.log("matchUser: " + JSON.stringify(signData));
        this.frontSign =  new AvatarMessage(planeSize, signX, signY, signZ, signData, this)

    }

    async createAvatarMesh(scene) {
        //console.log("avatarURL: " + avatarURL)
        /*        
       await BABYLON.SceneLoader.AppendAsync("", avatarURL, scene);
        let beforeavatarMesh = scene.meshes[scene.meshes.length - 1];
        let avatarMesh = beforeavatarMesh.parent;
        return avatarMesh.parent;
        */
        /// Load the GLB model from the URL
        ///select gender by even or odd num
        /// if we know how mwny boys and have way to set it we can replace it with a better way
        let avatarURL
        if (this.avatarData.num % 2 === 0) {
            avatarURL = this.avatarData.avatarURL;
            this.avatarData.loadedIsMan = false;
        } else {
            avatarURL = this.avatarData.avatarURLBoy;
            this.avatarData.loadedIsMan = true;
        }

        const response = await fetch(avatarURL, { method: 'HEAD' });

        if (!response.ok) {
            console.warn(`GLB file not found at: ${avatarURL}`);
            return;
        }


        const result = await BABYLON.SceneLoader.ImportMeshAsync(
            null,
            "",
            avatarURL,
            scene
        );
/*
        // Find the top-level node among them (those with no parent)
        result.meshes.forEach(m => {
            console.log(`Mesh: ${m.name} | Vertices: ${m.getTotalVertices()} | Visible: ${m.isVisible}`);
        });
        */
        const root = result.meshes.find(m => !m.parent);
        if (!root) {
            console.warn("No root mesh found in imported GLB!");
            return null;
        }
        this.avatarMesh = root;
        //this.avatarMesh.scaling = new BABYLON.Vector3(1, 1, 1);
        ///return root;
    }
    ///place the avatar in the world
    placeAvatar() {
        // Use this.avatarData instead of avatarDetails
        const data = this.avatarData;
        if (this.avatarMesh) {
            //this.avatarMesh.scaling = new BABYLON.Vector3(-1, 1, -1);
            this.avatarMesh.position = new BABYLON.Vector3(data.x, data.y, data.z);
            this.avatarMesh.lookAt(new BABYLON.Vector3(data.targetX, data.targetY, data.targetZ));
            this.avatarMesh.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);
            
        }
    }

    chatRequest() {
        this.myWorld.chatRequest(this.ID);
        //console.log("chatRequest on avatar: " + this.ID);
    }

    ///usage: const deltaRotation = { x: 0, y: 45, z: 0 }; // Rotate 45 degrees around the Y axis 
    rotateMeshByDegrees(deltaRotation) {
        // Convert degrees to radians
        //console.log("deltaRotation: " + deltaRotation);
        const deltaRotationRadians = {
            x: BABYLON.Tools.ToRadians(deltaRotation.x),
            y: BABYLON.Tools.ToRadians(deltaRotation.y),
            z: BABYLON.Tools.ToRadians(deltaRotation.z)
        };
        //console.log("deltaRotationRadians: " + deltaRotationRadians);
        // Apply the rotation relative to the current rotation
        this.avatarMesh.rotation.x += deltaRotationRadians.x;
        this.avatarMesh.rotation.y += deltaRotationRadians.y;
        this.avatarMesh.rotation.z += deltaRotationRadians.z;
    }

    calculateTargetPosition(mesh, deltaRotationDegrees) {
        // Convert degrees to radians
        const deltaRotationRadians = {
            x: BABYLON.Tools.ToRadians(deltaRotationDegrees.x),
            y: BABYLON.Tools.ToRadians(deltaRotationDegrees.y),
            z: BABYLON.Tools.ToRadians(deltaRotationDegrees.z)
        };

        // Get the current position of the mesh
        const currentPosition = mesh.position;

        // Calculate the direction vector based on the current rotation and the desired delta rotation
        const direction = new BABYLON.Vector3(
            Math.sin(deltaRotationRadians.y),
            0,
            Math.cos(deltaRotationRadians.y)
        );

        // Calculate the target position by adding the direction vector to the current position
        const targetPosition = currentPosition.add(direction);

        return targetPosition;
    }
    ///noChat, myChat, inChat
    hideButtons() {
        //this.statusData = { status: "noChat" };
        if (this.frontSign) {
            this.frontSign.hideButtons();
        }

    }

    setState(state) {
        this.frontSign.setState(state);
    }
    setDone() {
        this.frontSign.setState("done");
    }
}