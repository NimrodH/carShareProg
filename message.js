"use strict"

class AvatarMessage {
    //nextButton;///also sent as parameter in new session and called from there
    constructor(planeSize, x, y, z, signData, avatar) {
        console.log("in AvatarMessage")
        this.myAvatar = avatar;
        this.plane = BABYLON.MeshBuilder.CreatePlane("plane", { height: planeSize, width: -planeSize });
        this.advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(this.plane);
        //this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without it its mirror
        //this.plane.position = new BABYLON.Vector3(x, y, z);
        ///this.plane.position = new BABYLON.Vector3(0, 0, 0);///////////////
        //this.plane.setParent(this.myAvatar.avatarMesh);
//////////////////////////////
        //this.avatarMesh.scaling = new BABYLON.Vector3(1, 1, 1);
        const anchor = new BABYLON.TransformNode("anchor", scene);
        anchor.scaling = new BABYLON.Vector3(-1, 1, -1);
        //anchor.scaling = new BABYLON.Vector3(1, 1, 1);
        anchor.parent = this.myAvatar.avatarMesh;
        anchor.position = new BABYLON.Vector3(x, y, z); // try different Y/Z to move above chest
        this.plane.parent = anchor;
        //this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;

////////////////////

        this.plane.setParent(this.myAvatar.avatarMesh);

        this.advancedTexture.background = 'green'


        //this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without it its mirror

        this.textField = new BABYLON.GUI.TextBlock("upperText");

        //this.advancedTexture.background = 'green'


        this.nextButton = BABYLON.GUI.Button.CreateSimpleButton("but1", "לחץ להתחת שיחה");
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
        if signData.isLoading {
            this.setState("loading");
        } else{
            this.setState("noChat");
        }
    
        let text1 = this.textField;
        text1.color = "white"
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

    ///noChat, myChat, inChat
    setState(state) {
        switch (state) {
            case "noChat":
                this.nextButton.isEnabled = true;
                this.nextButton.textBlock.text = "לחץ להתחלת שיחה";
                this.nextButton.color = "white";
                break;
            case "myChat":
                this.nextButton.isEnabled = false;
                this.nextButton.textBlock.text = "בשיחה איתך";
                this.nextButton.color = "blue";
                break;
            case "inChat":
                this.nextButton.isEnabled = false;
                this.nextButton.color = "red";
                this.nextButton.textBlock.text = "עסוק בשיחה";
                break;
            case "done":
                this.nextButton.isEnabled = false;
                this.nextButton.color = "red";
                this.nextButton.textBlock.text = "סיימתי - לא זמין לשיחה נוספת";
                break;
            case "loading":
                this.nextButton.isEnabled = false;
                this.nextButton.color = "red";
                this.nextButton.textBlock.text = "טוען נתונים, נא להמתין";
                break;
            case "me":
                this.nextButton.isEnabled = false;
                this.nextButton.isVisible = false; //hide the button
                //this.nextButton.color = "red";
                break;
        }
    }
}

class Chat {
    constructor(avatarFrom, avatarTo, world) {
        this.avatarFromID = avatarFrom.ID;
        this.avatarToID = avatarTo.ID;
        this.chatID = this.avatarFromID + "_" + this.avatarToID;
        this.myWorld = world;
        //console.log("this.myWorld.myAvatar:");
        //console.log(this.myWorld.myAvatar);
        //we dont need userNameTo
        if (this.myWorld.myAvatar.ID == this.avatarFromID) {
            this.userNameFrom = avatarFrom.userName;
        } else {
            this.userNameFrom = avatarTo.userName;
        }

        this.advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        //this.advancedTexture.rootContainer.scaleX = 1 / window.devicePixelRatio;
        //this.advancedTexture.rootContainer.scaleY = 1 / window.devicePixelRatio; 
        //this didn't work. I set all sizes in %  

        this.rect1 = new BABYLON.GUI.Rectangle();
        this.rect1.width = "35%" //"500px";
        this.rect1.height = "85%"//"600px";
        this.rect1.cornerRadius = 20;
        this.rect1.color = "green";
        this.rect1.thickness = 4;
        this.rect1.background = "black";
        this.rect1.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.rect1.left = "-1%";
        this.advancedTexture.addControl(this.rect1);


        this.grid = new BABYLON.GUI.Grid();
        this.grid.background = "black";
        this.grid.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.grid.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.rect1.addControl(this.grid);

        this.grid.width = 0.95;
        this.grid.height = 0.98;


        this.grid.addRowDefinition(0.76);
        this.grid.addRowDefinition(0.12);
        this.grid.addRowDefinition(0.12);
        /* not working
        this.grid.addColumnDefinition(0.25); // Column 0       
        this.grid.addColumnDefinition(0.25); // Column 0       
        this.grid.addColumnDefinition(0.25); // Column 0       
        this.grid.addColumnDefinition(0.25); // Column 0       
        */
        this.scrollViewer = new BABYLON.GUI.ScrollViewer(null, true);
        this.scrollViewer.width = "100%";
        this.scrollViewer.height = 1;
        this.scrollViewer.background = "#CCCCCC";
        this.scrollViewer.color = "black";
        this.scrollViewer.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_STRETCH;
        this.grid.addControl(this.scrollViewer, 0, 0);//0,0
        //this.grid.setColumnSpan(this.scrollViewer, 4);


        this.sendButton = BABYLON.GUI.Button.CreateSimpleButton("sendButton", "שלח ההודעה");
        this.sendButton.width = 0.2;
        this.sendButton.height = 0.8;
        this.sendButton.color = "white";
        this.sendButton.background = "black";
        this.sendButton.onPointerUpObservable.add(this.sendLine.bind(this));
        this.grid.addControl(this.sendButton, 2, 0);//2,0
        //this.sendButton.right = "10px";
        this.sendButton.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.sendButton.fontSize = "25%";

        this.buttonDeal = BABYLON.GUI.Button.CreateSimpleButton("dealButton", "סוכמה נסיעה");
        this.buttonDeal.width = 0.2;
        this.buttonDeal.height = 0.8;
        this.buttonDeal.color = "white";
        this.buttonDeal.background = "green";
        this.buttonDeal.onPointerUpObservable.add(this.dealDoneSelected.bind(this));
        this.buttonDeal.left = "-13%";
        //this.buttonDeal.paddingRight = 0.35;//"75px"
        this.grid.addControl(this.buttonDeal, 2, 1);//2,0
        this.buttonDeal.fontSize = "25%";

        this.buttonClose = BABYLON.GUI.Button.CreateSimpleButton("closeButton", "סגור");
        this.buttonClose.width = 0.2;
        this.buttonClose.height = 0.8;
        this.buttonClose.color = "white";
        this.buttonClose.background = "green";
        this.buttonClose.onPointerUpObservable.add(this.closeChat.bind(this));
        this.grid.addControl(this.buttonClose, 2, 0);//2,0
        this.buttonClose.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.buttonClose.fontSize = "25%";

        this.buttonNoDeal = BABYLON.GUI.Button.CreateSimpleButton("closeNoDealButton", "לא סוכם");
        this.buttonNoDeal.width = 0.2;
        this.buttonNoDeal.height = 0.8;
        this.buttonNoDeal.color = "white";
        this.buttonNoDeal.background = "red";
        this.buttonNoDeal.onPointerUpObservable.add(this.dealNotDoneSelected.bind(this));
        this.buttonNoDeal.fontSize = "25%";

        this.grid.addControl(this.buttonNoDeal, 2, 2);//2,0
        this.buttonNoDeal.left = "13%";
        //this.buttonNoDeal.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        //this.buttonNoDeal.paddingLeft = "15%"//"75px";

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
        //this.textBlock.text = "שלום";   
        this.textBlock.fontSize = "5%";
        this.scrollViewer.addControl(this.textBlock);

        this.messageInput = new BABYLON.GUI.InputText('id', "");
        this.messageInput.height = 0.8;
        this.messageInput.color = "white";
        this.messageInput.fontSize = "35%";//24
        //this.messageInput.paddingRight = "10px";
        this.messageInput.width = 1;//0.95;
        this.messageInput.placeholderText = "כתוב כאן את ההודעה ולחץ על כפתור שלח";
        this.messageInput.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

        //this.messageInput.onTextChangedObservable.add(() => button.isEnabled = true);
        this.grid.addControl(this.messageInput, 1, 0);//1,0

        // this.grid.setColumnSpan(this.messageInput, 4);
        this.setChatState("start")
    }

    ///sent from sendLine to handle localy.
    updateText(theText) {
        this.textBlock.text = theText;
        //this.myWorld.chatStarted(this.avatarToID, this.avatarFromID);
    }
    getText() {
        return this.textBlock.text;
    }

    ///sent from button "שלח ההודעה"
    sendLine() {
        //this.myWorld.sendLine(this.chatLine.text);
        //console.log("sendLine clicked: " + this.messageInput.text);
        let text = this.textBlock.text + "\n" + this.userNameFrom + ": " + this.messageInput.text;
        this.updateText(text);
        this.messageInput.text = "";
        //TODO: send the message to my avatar 
        this.myWorld.updateChat(this.chatID, this.avatarFromID, this.avatarToID, text)
    }

    dealDoneSelected() {
        //console.log("dealDone clicked: ");
        this.buttonClose.isEnabled = true;
        this.myWorld.dealDoneSelected(this.chatID, this.avatarFromID, this.avatarToID);
    }

    dealNotDoneSelected() {
        //console.log("dealNotDone clicked: ");
        this.buttonClose.isEnabled = true;
        this.myWorld.dealNotDoneSelected(this.chatID, this.avatarFromID, this.avatarToID);
    }

    closeChat() {
        if (this.myWorld.currChat.chatID == this.chatID) {
            this.myWorld.closeChat(this.avatarFromID, this.avatarToID);
        } else {
            ///somthing wrong, close the chat popup and set currChat to null (to enable other chats)
            this.dispose();
            if (this.myWorld.currChat) {
                this.myWorld.currChat = null;
            }
        }
    }

    dispose() {
        this.advancedTexture.dispose();
        this.rect1.dispose();
        this.grid.dispose();
        this.scrollViewer.dispose();
        this.sendButton.dispose();
        this.buttonDeal.dispose();
        this.buttonNoDeal.dispose();
        this.textBlock.dispose();
        this.messageInput.dispose();
    }

    setChatState(state) {
        switch (state) {
            case "start":
                //this.textBlock.text = "שלום"
                this.sendButton.isEnabled = true;
                this.buttonDeal.isEnabled = true;
                this.buttonNoDeal.isEnabled = true;
                this.buttonClose.isEnabled = false;//false; ///true for test to see why other some times not closed
                break;
            case "refused":
                this.textBlock.text = "המשתתף השני בחר באפשרות [לא סוכם] לכן הנסיעה לא נקבעה. בחר סגור. תוכל לנסות לברר איתו למה בחר כך בשיחה נוספת.";
                this.sendButton.isEnabled = false;
                this.buttonDeal.isEnabled = false;
                this.buttonNoDeal.isEnabled = false;
                this.buttonClose.isEnabled = true;
                break;
            case "wait":
                this.textBlock.text = "המשתתף השני עדיין לא בחר, המתן, והקלק שוב על תשובתך"
                this.sendButton.isEnabled = false;
                this.buttonDeal.isEnabled = true;
                this.buttonNoDeal.isEnabled = true;
                this.buttonClose.isEnabled = true;//false; ///true for test to see why other some times not closed
                break;
            case "done":
                this.textBlock.text = "סוכם על ביצוע נסיעה משותפת. לחץ [סגור] כדי לסיים את השיחה";
                this.sendButton.isEnabled = false;
                this.buttonDeal.isEnabled = false;
                this.buttonNoDeal.isEnabled = false;
                this.buttonClose.isEnabled = true;
                break;
            case "notDone":
                this.textBlock.text = "לא סוכם על נסיעה. בחר [סגור], ונסה לתאם עם מישהו אחר"
                this.sendButton.isEnabled = false;
                this.buttonDeal.isEnabled = false;
                this.buttonNoDeal.isEnabled = false;
                this.buttonClose.isEnabled = true;
                break;
            case "otherAccepted":
                this.textBlock.text = "רק המשתתף השני בחר באפשרות [סוכם]. הנסיעה לא נקבעה. בחר סגור. תוכל לנסות לברר איתו למה בחר כך בשיחה נוספת."
                this.sendButton.isEnabled = false;
                this.buttonDeal.isEnabled = false;
                this.buttonNoDeal.isEnabled = false;
                this.buttonClose.isEnabled = true;
                break;
        }
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
        this.plane.position.z = 20;///-20
        this.plane.position.y = 4;///
        this.plane.position.x = 0;
        this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without iא its mirror

        this.advancedTexture.background = "green";//green - 'orange' for debug color

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
        text1.color = "white"
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
        //console.log(this.buttonWoman.isChecked)
    }


    screenDone() {
        //let a = 22;
        //console.log("next clicked: " + this.buttonMan.isChecked)
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
        //console.log(wellcomeData)
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

class MessageScreen {   //plane = BABYLON.Mesh.CreatePlane("plane2",  { height: 1, width: 1 });
    plane = BABYLON.Mesh.CreatePlane("plane2", 10);
    advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(this.plane);
    currentScreen = "info";
    nextButton;///also sent as parameter in new session and called from there

    constructor(world, msg, screenType = "info") {
        let showButton = false;
        this.world = world;
        this.msg = msg
        this.screenType = screenType;
        if (this.screenType == "info") {
            showButton = false;
        } else {
            showButton = true;
        }

        this.plane.position.z = 20;///-20
        this.plane.position.y = 4;///
        this.plane.position.x = 0;
        this.plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;///without iא its mirror

        this.advancedTexture.background = "green"
        if (showButton) {
            this.nextButton = BABYLON.GUI.Button.CreateSimpleButton("but1", "המשך");
            this.nextButton.width = 1;
            this.nextButton.height = 0.4;
            this.nextButton.color = "white";
            this.nextButton.fontSize = 50;
            this.nextButton.background = "green";
            this.nextButton.onPointerUpObservable.add(this.okClicked.bind(this));
            this.nextButton.top = "300";//90
            this.nextButton.left = "10px";
            this.nextButton.height = "70px";
            this.advancedTexture.addControl(this.nextButton);
        }
        const gap = 150;
        const topLines = -450;
        const gapLines = -100
        this.iterationField = this._addTextField(this.msg, 10, -450, 150, 60)
        this.msgField = this._addTextField(this.msg)

    }
    _addTextField(text, left = -50, top = -200, width = 800, height = 400) {
        //"-450px"
        const leftStr = left.toString() + "px";
        const topStr = top.toString() + "px";
        const widthStr = width.toString() + "px";
        const hight = height.toString() + "px";
        let text1 = new BABYLON.GUI.TextBlock("upperText");
        text1.text = text;//"Hello world";
        text1.color = "white"
        text1.fontSize = 34;

        text1.top = topStr;///"-450px";
        text1.left = leftStr;///"400px"
        text1.height = height;///"660px"
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

    updateIterationText(iteration) {
        this.iterationField.text = iteration;
    }

    updateMessageText(message) {
        this.msgField.text = message;
    }

    okClicked() {
        this.world.okClicked(this.screenType)
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


/* + "\n" + "\n" +
    "מאחוריך מספר לבנים לבניית המודל" + "\n" + "\n" + 
    "[אחרי שראינו את האבנים יש להקליק על כפתור [המשך" + "\n" +
     "הקלקה פרושה להצביע עם הקרן על הכפתור וללחוץ על ההדק";
     */