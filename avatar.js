

class Avatar {
 
    constructor(avatarID, avatarURL, world) {
        this.myWorld = world;
        this.avatarURL = avatarURL;
        this.ID = avatarID;
        console.log("Avatar ID: " + this.ID);
    }

    async initAvatar( avatarDetails, signData, scene) {
        const planeSize = 0.85;
        const signX = 0;
        const signY = 0.55;
        const signZ = 0.18;
        this.userName = signData.userName;
        this.avatarMesh = await this.createAvatarMesh(this.avatarURL, scene);
        //console.log(avatarDetails)
        if(signData.avatarID[0] == "A") {  
            this.avatarMesh.getChildMeshes().forEach(child => {
                //child.setEnabled(false); // This will completely disable the mesh
                // Alternatively, you can use:
                child.visibility = 0; 
            });
        }
        //this.avatarMesh.alpha = 0.5;
        this.frontSign = new AvatarMessage(planeSize, signX, signY, signZ, signData, this)
        this.avatarMesh.position = new BABYLON.Vector3(avatarDetails.x, avatarDetails.y, avatarDetails.z);
        //this.avatarMesh.visibility = 0;
        //this.avatarMesh.isVisible = false
        //const deltaRotation = { x: 0, y: 45, z: 45 }; // Rotate 180 degrees around the Y axis
        //this.avatarMesh.lookAt(new BABYLON.Vector3(avatarDetails.targetX, avatarDetails.targetY, avatarDetails.targetZ));
        //this.avatarMesh.lookAt(camera.position)
        //this.rotateMeshByDegrees(deltaRotation);
        //this.avatarMesh.rotation.y = 0;
        //this.avatarMesh.rotation.x = 0;
        //this.avatarMesh.rotation.z = 0;
        this.avatarMesh.lookAt(new BABYLON.Vector3(avatarDetails.targetX, avatarDetails.targetY, avatarDetails.targetZ));
        this.avatarMesh.rotate(BABYLON.Axis.Y, Math.PI, BABYLON.Space.LOCAL);
        

        //console.log("avatar rotation: ");

        ////console.log (this.avatarMesh.rotation)
        //this.rotateMeshByDegrees({x:0, y:90, z:0});
        //this.avatarMesh.lookAt(newTargetPos);
        ////console.log("avatar rotation: ");

        ////console.log (this.avatarMesh.rotation) 
        ///TODO:set position by avatarDetails.targetX, targetY, targetZ
    }

    async createAvatarMesh(avatarURL, scene) {
        //console.log("avatarURL: " + avatarURL)
       await BABYLON.SceneLoader.AppendAsync("", avatarURL, scene);
        let beforeavatarMesh = scene.meshes[scene.meshes.length - 1];
        let avatarMesh = beforeavatarMesh.parent;

      /*  avatarMesh.getChildMeshes().forEach(child => {
            //child.setEnabled(false); // This will completely disable the mesh
            // Alternatively, you can use:
            child.visibility = 0; 
        });
        */
        return avatarMesh.parent;
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
    setState(state) {
        this.frontSign.setState(state);
    }
    
}