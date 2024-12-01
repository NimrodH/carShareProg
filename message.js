"use strict"

class AvatarMessage {
    //nextButton;///also sent as parameter in new session and called from there
    constructor(planeSize, x, y, z, signData, avatar) {
        this.myAvatar = avatar;
        this.plane = BABYLON.MeshBuilder.CreatePlane("plane", { height: planeSize, width: -planeSize });
        this.advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(this.plane);
        //this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without it its mirror
        this.plane.position = new BABYLON.Vector3(x, y, z);
        this.plane.setParent(this.myAvatar.avatarMesh);
        this.advancedTexture.background = 'green'


        //this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without it its mirror

        this.textField = new BABYLON.GUI.TextBlock("upperText");

        //this.advancedTexture.background = 'green'


        this.nextButton = BABYLON.GUI.Button.CreateSimpleButton("but1", "המשך");
        this.nextButton.width = 1;
        this.nextButton.height = 0.4;
        this.nextButton.color = "white";
        this.nextButton.fontSize = 50;
        this.nextButton.background = "green";
        this.nextButton.onPointerUpObservable.add(this.chatRequest.bind(this));
        this.nextButton.top = "250px";//90
        this.nextButton.left = "10px";
        this.nextButton.height = "70px";
        this.advancedTexture.addControl(this.nextButton);

        let text1 = this.textField;
        text1.color = "white"//"red";
        text1.fontSize = 36;
        text1.top = "-150px";
        text1.height = "600px"
        this.advancedTexture.addControl(text1);
        this.updateText(this.createMessage(signData));
    }

    updateText(theText) {
        this.textField.text = theText;
    }

    createMessage(signData) {
        signData.name = " אהובה כהן";///temp for testing to be added to signData
        const sheTravel = "נוסעת";
        const heTravel = "נוסע";
        const sheTravelBack = "חוזרת";
        const heTravelBack = "חוזר";
        let travel;
        let travelBack;
        let message = signData.userName + "\n\n";
        if (signData.isMan) {
            travelBack = heTravelBack; //חוזר
            travel = heTravel; //נוסע
        } else {
            travelBack = sheTravelBack; //חוזרת
            travel = sheTravel; //נוסעת
        }

        if (signData.day1to != "") {
            message += travel + " ביום א' בשעה " + signData.day1to + "\n";
        }
        if (signData.day1back != "") {
            message += travelBack + " ביום א' בשעה " + signData.day1back + "\n";
        }
        if (signData.day2to != "") {
            message += travel + " ביום ב' בשעה " + signData.day2to + "\n";
        }
        if (signData.day2back != "") {
            message += travelBack + " ביום ב' בשעה " + signData.day2back + "\n";
        }
        if (signData.day3to != "") {
            message += travel + " ביום ג' בשעה " + signData.day3to + "\n";
        }
        if (signData.day3back != "") {
            message += travelBack + " ביום ג' בשעה " + signData.day3back + "\n";
        }
        if (signData.day4to != "") {
            message += travel + " ביום ד' בשעה " + signData.day4to + "\n";
        }
        if (signData.day4back != "") {
            message += travelBack + " ביום ד' בשעה " + signData.day4back + "\n";
        }
        if (signData.day5to != "") {
            message += travel + " ביום ה' בשעה " + signData.day5to + "\n";
        }
        if (signData.day5back != "") {
            message += travelBack + " ביום ה' בשעה " + signData.day5back + "\n";
        }
        message += "מהכתובת: " + signData.address + "\n";

        return message;
    }

    chatRequest() {
        this.myAvatar.chatRequest();
    }
}
class Chat {
    constructor(avatarToID, avatarFromID, world) {

        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

        const rect1 = new BABYLON.GUI.Rectangle();
        rect1.width = "500px";
        rect1.height = "600px";
        rect1.cornerRadius = 20;
        rect1.color = "Orange";
        rect1.thickness = 4;
        rect1.background = "black";
        advancedTexture.addControl(rect1);


        const grid = new BABYLON.GUI.Grid();
        grid.background = "black";
        grid.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        grid.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        rect1.addControl(grid);

        grid.width = 0.98;
        grid.height = 0.98;


        grid.addRowDefinition(0.76);
        grid.addRowDefinition(0.12);
        grid.addRowDefinition(0.12);        
        
        const scrollViewer = new BABYLON.GUI.ScrollViewer(null, true);
        scrollViewer.width = 1;
        scrollViewer.height = 1;
        scrollViewer.background = "#CCCCCC";
        scrollViewer.color = "black";
    
        grid.addControl(scrollViewer, 0, 0);

        var button = BABYLON.GUI.Button.CreateSimpleButton("but", "שלח");
        button.width = 0.4;
        button.height = 0.8;
        button.color = "white";
        button.background = "green";
        button.onPointerUpObservable.add(this.sendLine.bind(this));
        grid.addControl(button, 2, 0); 
        
        this.textBlock = new BABYLON.GUI.TextBlock();
        this.textBlock.textWrapping = BABYLON.GUI.TextWrapping.WordWrap;
        this.textBlock.resizeToFit = true;
        this.textBlock.paddingTop = "5%";
        this.textBlock.paddingLeft = "30px";
        this.textBlock.paddingRight = "20px"
        this.textBlock.paddingBottom = "5%";
        this.textBlock.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.textBlock.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.textBlock.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.textBlock.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.textBlock.color = "red";
        this.textBlock.background = "yellow";
    
        this.textBlock.text = "שלום";   
    
        this.textBlock.fontSize = "24px";
    
        scrollViewer.addControl(this.textBlock);

        this. inputTextArea = new BABYLON.GUI.InputText('id', "");

        this.inputTextArea.height = 0.8;
        this.inputTextArea.color = "white";
        this.inputTextArea.fontSize = 24;
        //this.inputTextArea.top = "10px";
        this.inputTextArea.width = 0.95;
        this.inputTextArea.placeholderText = "בתוב כאן את ההודעה שלך ולחץ על כפתור שלח";
        this.inputTextArea.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;

        //this.inputTextArea.onTextChangedObservable.add(() => button.isEnabled = true);

        grid.addControl(this.inputTextArea, 1, 0);

    }

    _addInputText(left, top, areaWidth = 120, areaHight = 70) {
        const leftStr = left.toString() + "px";
        const topStr = top.toString() + "px";
        const hightStr = areaHight.toString() + "px";
        const widthStr = areaWidth.toString() + "px";
        let inputTextArea = new BABYLON.GUI.InputText('id', "");
        inputTextArea.height = "40px";
        inputTextArea.color = "white";
        inputTextArea.fontSize = 34;
        inputTextArea.top = topStr;
        inputTextArea.height = hightStr;
        inputTextArea.width = widthStr;
        inputTextArea.left = leftStr;
        inputTextArea.onTextChangedObservable.add(() => this.nextButton.isEnabled = true);
        this.advancedTexture.addControl(inputTextArea);
        //this.keyboard.connect(inputTextArea);//needed for headset not pc. If used, neeed more place & uncomment this._addKeyboard();, too

        return inputTextArea;
    }

    updateText(theText) {
        this.textBlock.text = theText;
    }

   

    sendLine() {
        //this.myWorld.sendLine(this.chatLine.text);
        console.log("sendLine clicked: " + this.inputTextArea.text);
        this.updateText(this.textBlock.text + "\n" + this.inputTextArea.text);
        this.inputTextArea.text = "";
    }

}

class Wellcome {

    //plane = BABYLON.Mesh.CreatePlane("plane2",  { height: 1, width: 1 });
    plane = BABYLON.Mesh.CreatePlane("plane2", 10);
    advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(this.plane);
    currentScreen = "init";
    nextButton;///also sent as parameter in new session and called from there
    constructor(world) {
        this.world = world;
        //this.keyboard = this._addKeyboard();//needed for headset not pc. If used,  neeed more place & uncomment this.keyboard.connect, too
        this.plane.position.z = -20;
        this.plane.position.y = 4;/////2
        this.plane.position.x = 0;
        this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without iא its mirror

        this.advancedTexture.background = 'green'

        this.nextButton = BABYLON.GUI.Button.CreateSimpleButton("but1", "המשך");
        this.nextButton.width = 1;
        this.nextButton.height = 0.4;
        this.nextButton.color = "white";
        this.nextButton.fontSize = 50;
        this.nextButton.background = "green";
        this.nextButton.onPointerUpObservable.add(this.screenDone.bind(this));
        this.nextButton.top = "300";//90
        this.nextButton.left = "10px";
        this.nextButton.height = "70px";
        this.advancedTexture.addControl(this.nextButton);

        const gap = 150;
        const topLines = -450;
        const gapLines = -100
        this._addTextField(":יום", 400, topLines)
        this._addTextField("א", 400 - gap * 1, topLines)
        this._addTextField("ב", 400 - gap * 2, topLines)
        this._addTextField("ג", 400 - gap * 3, topLines)
        this._addTextField("ד", 400 - gap * 4, topLines)
        this._addTextField("ה", 400 - gap * 5, topLines)
        this._addTextField(":שעה הלוך", 400, topLines - gapLines, 140)
        this._addTextField(":שעה חזור", 400, topLines - gapLines * 2, 140)

        this.day1fromHome = this._addInputText(400 - gap * 1, topLines - gapLines);
        this.day2fromHome = this._addInputText(400 - gap * 2, topLines - gapLines);
        this.day3fromHome = this._addInputText(400 - gap * 3, topLines - gapLines);
        this.day4fromHome = this._addInputText(400 - gap * 4, topLines - gapLines);
        this.day5fromHome = this._addInputText(400 - gap * 5, topLines - gapLines);

        this.day1toHome = this._addInputText(400 - gap * 1, topLines - gapLines * 2);
        this.day2toHome = this._addInputText(400 - gap * 2, topLines - gapLines * 2);
        this.day3toHome = this._addInputText(400 - gap * 3, topLines - gapLines * 2);
        this.day4toHome = this._addInputText(400 - gap * 4, topLines - gapLines * 2);
        this.day5toHome = this._addInputText(400 - gap * 5, topLines - gapLines * 2);

        this.address = this._addInputText(400 - gap * 2.5, topLines - gapLines * 5.5, 900, 70);
        this._addTextField(":אזור מגורים", 400, topLines - gapLines * 4.7, 200);

        this.userName = this._addInputText(400 - gap * 2.5, topLines - gapLines * 4, 900, 70);
        this._addTextField(":שם ", 400, topLines - gapLines * 3.3, 200);

        this._addTextField("ID", 400 - gap * 1.25, topLines - gapLines * 3)
        this.ID = this._addInputText(400 - gap * 2, topLines - gapLines * 3);
        this.buttonMan = this._addRadioButtens(400 - gap * 3.75, topLines - gapLines * 3, false, "man");
        this._addTextField("זכר", 400 - gap * 3.25, topLines - gapLines * 3)
        this.buttonWoman = this._addRadioButtens(400 - gap * 5, topLines - gapLines * 3, false, "woman");
        this._addTextField("נקבה", 400 - gap * 4.5, topLines - gapLines * 3)


        ///listen to this event and set the nextButton state
        //addEventListener("reportClick", this.handleReportClick.bind(this))
        //this.advancedTexture.focusedControl = inputTextArea;///create bug
        //plane.isVisible = true;
        //plane.dispose();
    }
    _addTextField(text, left, top, width = 70) {
        //"-450px"
        const leftStr = left.toString() + "px";
        const topStr = top.toString() + "px";
        const widthStr = width.toString() + "px";
        let text1 = new BABYLON.GUI.TextBlock("upperText");
        text1.text = text;//"Hello world";
        text1.color = "white"//"red";
        text1.fontSize = 34;

        text1.top = topStr;///"-450px";
        text1.left = leftStr;///"400px"
        text1.height = "100px";///"660px"
        text1.width = widthStr;
        this.advancedTexture.addControl(text1);
        return text1;
    }

    _addInputText(left, top, areaWidth = 120, areaHight = 70) {
        const leftStr = left.toString() + "px";
        const topStr = top.toString() + "px";
        const hightStr = areaHight.toString() + "px";
        const widthStr = areaWidth.toString() + "px";
        let inputTextArea = new BABYLON.GUI.InputText('id', "");
        inputTextArea.height = "40px";
        inputTextArea.color = "white";
        inputTextArea.fontSize = 34;
        inputTextArea.top = topStr;
        inputTextArea.height = hightStr;
        inputTextArea.width = widthStr;
        inputTextArea.left = leftStr;
        inputTextArea.onTextChangedObservable.add(() => this.nextButton.isEnabled = true);
        this.advancedTexture.addControl(inputTextArea);
        //this.keyboard.connect(inputTextArea);//needed for headset not pc. If used, neeed more place & uncomment this._addKeyboard();, too

        return inputTextArea;
    }

    _addKeyboard() {
        const keyboard = new BABYLON.GUI.VirtualKeyboard("vkb");
        keyboard.addKeysRow(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "\u2190"]);
        keyboard.addKeysRow(["א", "ב", "ג", "ד"]);

        keyboard.top = "170px";
        keyboard.scaleY = 2;
        keyboard.scaleX = 2;
        //keyboard.left = "10px";
        this.advancedTexture.addControl(keyboard);
        return keyboard;
    }

    _addRadioButtens(left, top, checked) {
        const leftStr = left.toString() + "px";
        const topStr = top.toString() + "px";

        let radioButton = new BABYLON.GUI.RadioButton("man");
        this.advancedTexture.addControl(radioButton);
        radioButton.top = topStr;///"-450px";
        radioButton.left = leftStr;///"400px"
        radioButton.height = "50px";///"660px"
        radioButton.width = "50px";///"660px"
        radioButton.isChecked = checked;
        radioButton.color = "white";
        radioButton.background = "black";

        radioButton.onIsCheckedChangedObservable.add((state) => this._checkRadioButton());
        return radioButton;
    }

    _checkRadioButton() {
        console.log(this.buttonWoman.isChecked)
    }


    screenDone() {
        //let a = 22;
        console.log("next clicked: " + this.buttonMan.isChecked)
        ////create object with data from welcome fields to send to World. when no data entered we get: ''
        let wellcomeData = {
            avatarID: this.ID.text,
            isMan: this.buttonMan.isChecked,
            address: this.address.text,
            day1to: this.day1fromHome.text,
            day1back: this.day1toHome.text,
            day2to: this.day2fromHome.text,
            day2back: this.day2toHome.text,
            day3to: this.day3fromHome.text,
            day3back: this.day3toHome.text,
            day4to: this.day4fromHome.text,
            day4back: this.day4toHome.text,
            day5to: this.day5fromHome.text,
            day5back: this.day5toHome.text,
            userName: this.userName.text
        }
        console.log(wellcomeData)
        this.world.wellcomeDone(wellcomeData)
        this.clearInstance();
    }

    clearInstance() {
        this.advancedTexture.dispose();
        this.plane.dispose();

        // Remove reference to the instance itself if needed
        // Assuming `this` is the only reference to the instance
        for (let prop in this) {
            if (this.hasOwnProperty(prop)) {
                delete this[prop];
            }
        }
    }

}
////this.nextButton.isEnabled = true;

/* + "\n" + "\n" +
    "מאחוריך מספר לבנים לבניית המודל" + "\n" + "\n" + 
    "[אחרי שראינו את האבנים יש להקליק על כפתור [המשך" + "\n" +
     "הקלקה פרושה להצביע עם הקרן על הכפתור וללחוץ על ההדק";
     */