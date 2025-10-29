// world.js — merged HTTP-only version
// Combines full visual/avatar logic from old version with new HTTP communication

class World {
  constructor(scene) {
    this.scene = scene;
    this._avatarsArr = []; // all avatar objects
    this._wellcome = new Wellcome(this);
    this.myAvatar = {};
    this.allowPointer = false;
    this.msg = null;
    this.currChat = null;
    this.periodicUpdateInterval = null;
  }

  // ---------- WELCOME FLOW ----------
  async wellcomeDone(signData) {
    console.log("[WORLD] Welcome started");
    let loadingMessage;
    if (signData.avatarID[0] !== "A") {
      loadingMessage = `המתן - טוען אווטרים
כאשר שלט זה ייסגר חלק מהאווטרים יציגו 
שלט עם פרטי הנסיעה המעניינים אותם
ניתן יהיה ללחוץ על הכפתור בשלט
 כדי לקיים שיחת צ'אט עם אווטר רלוונטי
אווטרים נוספים יתווספו בהמשך`;
    } else {
      loadingMessage = `המתן - טוען 
כאשר שלט זה ייסגר חלק מהמשתתפים יציגו 
שלט עם פרטי הנסיעה המעניינים אותם
ניתן יהיה ללחוץ על הכפתור בשלט
 כדי לקיים שיחת צ'אט עם משתתף רלוונטי
משתתפים נוספים יתווספו בהמשך`;
    }

    this.msg = new MessageScreen(this, loadingMessage, "info");
    signData.isLoading = true;

    await postData("addAvatar", signData);

    // Create avatars (meshes)
    let i = 1;
    for (const avatarData of avatarsDataArray) {
      this.msg.updateIterationText(`${i++} / ${avatarsDataArray.length}`);
      const avatar = new Avatar(avatarData, this, signData.avatarID[0]);
      await avatar.createAvatarMesh(this.scene);
      await avatar.placeAvatar();
      this._avatarsArr.push(avatar);
    }

    this.msg.updateMessageText("ממתין לאחרים");
    this.allowPointer = true;

    const result = await getData("getAllStatuses");
    const signs = result.signs || [];

    for (const sign of signs) {
      let currAvatar = this.getFreeAvatar(sign.isMan);
      if (!currAvatar) continue;
      if (sign.avatarID === signData.avatarID) this.myAvatar = currAvatar;
      await currAvatar.matchUser(sign);
    }

    if (this.myAvatar?.setState) this.myAvatar.setState("me");

    await patchData(signData.avatarID, "isLoading", false)
      .then(() => console.log("[WORLD] Avatar loading finished"))
      .catch((err) => console.error("[WORLD] Update failed:", err));

    this.msg.clearInstance();
    this.msg = null;
    await this.periodicUpdate();
    this.startPeriodicUpdate();
    console.log("[WORLD] Welcome complete");
  }

  // ---------- PERIODIC UPDATE ----------
  startPeriodicUpdate() {
    if (this.periodicUpdateInterval) {
      console.warn("[UPDATE] Already running");
      return;
    }
    this.periodicUpdateInterval = setInterval(() => {
      this.periodicUpdate();
    }, 60 * 1000);
  }

  stopPeriodicUpdate() {
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
      this.periodicUpdateInterval = null;
      console.log("[UPDATE] Stopped");
    }
  }

  async periodicUpdate() {
    console.log("[UPDATE] Start");
    const result = await getData("getAllStatuses");
    const signs = r
