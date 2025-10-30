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

    // 1) Helper: read current status of a specific avatar (no writes)
    async isCalleeBusy(toID) {
        try {
            const res = await getData("getAllStatuses"); // returns { signs: [...], avatars: [...] }
            const avatars = res?.avatars || [];
            const callee = avatars.find(a => a.avatarID === toID);
            if (!callee) return false;                 // if unknown, don’t block
            return callee.status && callee.status !== "noChat";
        } catch (err) {
            console.warn("[CHAT] availability check failed; proceeding optimistically", err);
            return false; // on read error, let /chat/start be the source of truth
        }
    }

    // 2) Helper: quick UI nudge to show the callee looks busy (no server changes)
    showBusyHint(toAvatar) {
        if (!toAvatar) return;
        // reuse an existing visual state; brief flash and revert
        const prev = toAvatar.currState || "noChat";
        toAvatar.setState("refuseChat");
        setTimeout(() => {
            // don’t override if a chat actually started meanwhile
            if (!this.currChat) toAvatar.setState(prev);
        }, 1200);
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
        const signs = result.signs || [];
        const avatars = result.avatars || [];

        // update signs
        for (const sign of signs) {
            let currAvatar = this._avatarsArr.find(a => a.avatarID === sign.avatarID);
            if (!currAvatar) {
                currAvatar = this.getFreeAvatar(sign.isMan);
                if (!currAvatar) continue;
                await currAvatar.matchUser(sign);
            } else {
                currAvatar.setState(sign.isLoading ? "loading" : "noChat");
            }
        }

        // update avatar statuses
        for (const a of avatars) {
            const currAvatar = this._avatarsArr.find(v => v.avatarID === a.avatarID);
            if (currAvatar) currAvatar.setState(a.status);
        }

        // Auto-open chat window on the callee when server flipped me to inChat
        if (this.myAvatar && !this.currChat) {
            const meSrv = avatars.find(v => v.avatarID === this.myAvatar.ID);
            if (meSrv && meSrv.status === "inChat" && meSrv.partnerID && meSrv.chatID) {
                const partner = this.idToAvatar(meSrv.partnerID);
                if (partner) {
                    this.currChat = new Chat(this.myAvatar, partner, this, meSrv.chatID);
                    if (partner.setState) partner.setState("myChat");
                    if (this.myAvatar.setState) this.myAvatar.setState("myChat");
                    console.log("[CHAT] Auto-opened incoming chat:", meSrv.chatID);
                }
            }
        }

        // Auto-close my chat if the server shows I'm no longer inChat (remote ended)
        if (this.myAvatar && this.currChat) {
            const meSrv = avatars.find(v => v.avatarID === this.myAvatar.ID);
            if (meSrv) {
                const partnerID = this.currChat.avatarFromID === this.myAvatar.ID
                    ? this.currChat.avatarToID
                    : this.currChat.avatarFromID;
                const shouldClose =
                    meSrv.status !== "inChat" ||
                    !meSrv.chatID ||
                    meSrv.chatID !== this.currChat.chatID ||
                    meSrv.partnerID !== partnerID;
                if (shouldClose) {
                    // Local close (do NOT call /chat/end again)
                    this.currChat.dispose?.();
                    this.currChat = null;
                    this.allowPointer = true;
                    // visually reset both sides if present
                    const p = this.idToAvatar(partnerID);
                    if (p?.setState) p.setState("noChat");
                    if (this.myAvatar?.setState) this.myAvatar.setState("noChat");
                    console.log("[CHAT] Auto-closed (remote end detected)");
                }
            }
        }


        console.log("[UPDATE] End");
    }

    // ---------- AVATAR MANAGEMENT ----------
    getFreeAvatar(isMan) {
        let genderArray = this._avatarsArr.filter(a => !a.avatarData.isUsed && a.avatarData.loadedIsMan == isMan);
        if (genderArray.length === 0)
            genderArray = this._avatarsArr.filter(a => !a.avatarData.isUsed);
        if (genderArray.length === 0) return false;
        const avatarObj = genderArray[0];
        avatarObj.avatarData.isUsed = true;
        return avatarObj;
    }

    idToAvatar(id) {
        return this._avatarsArr.find(a => a.avatarID === id);
    }

    // ---------- CHAT ----------



    async chatRequest(toID) {
        const toAvatar = this.idToAvatar(toID);
        if (this.currChat || !toAvatar) return;

        console.log("[CHAT] Request to:", toID);
        this.allowPointer = false;

        // Read-only availability check (pure UX)
        try {
            const res = await getData("getAllStatuses"); // { avatars: [...] }
            const callee = (res?.avatars || []).find(a => a.avatarID === toID);
            const looksBusy = !!(callee && callee.status && callee.status !== "noChat");
            if (looksBusy) {
                // brief visual nudge only; do not write to server
                const prev = toAvatar.currState || "noChat";
                toAvatar.setState("refuseChat");
                setTimeout(() => { if (!this.currChat) toAvatar.setState(prev); }, 1200);
                this.allowPointer = true;
                return;
            }
        } catch (err) {
            console.warn("[CHAT] availability read failed; proceeding", err);
            // Instant visual feedback based on server error
            const e = (err && err.error) || (err && err.message) || "";
            if (e.includes("pairNotAllowed")) {
                toAvatar.setState?.("alreadyTalked");
            } else if (e.includes("calleeBusy")) {
                // (c) target started a different chat before we saw it → show refusal now
                toAvatar.setState?.("refuseChat");
            } else if (e.includes("avatarNotFound")) {
                // (b) target likely gone
                toAvatar.setState?.("done");
            }

        }

        // Single source of truth: server does the atomic flip for both sides
        try {
            const res = await postData("chat/start", {
                fromAvatarID: this.myAvatar.ID,
                toAvatarID: toID,
                messageId: crypto.randomUUID()
            });

            if (!res || !res.chatID) {
                console.warn("[CHAT] start rejected", res);
                const prev = toAvatar.currState || "noChat";
                toAvatar.setState("refuseChat");
                setTimeout(() => { if (!this.currChat) toAvatar.setState(prev); }, 1200);
                this.allowPointer = true;
                return;
            }

            //this.currChat = new Chat(this.myAvatar, toAvatar, this);
            this.currChat = new Chat(this.myAvatar, toAvatar, this, res.chatID);
            console.log("[CHAT] Started:", res.chatID);
        } catch (err) {
            console.error("[CHAT] start failed:", err);
            const prev = toAvatar.currState || "noChat";
            toAvatar.setState("refuseChat");
            setTimeout(() => { if (!this.currChat) toAvatar.setState(prev); }, 1200);
            this.allowPointer = true;
        }
    }
    /*
      async chatRequest(toID) {
        const toAvatar = this.idToAvatar(toID);
        if (this.currChat || !toAvatar) return;
    
        console.log("[CHAT] Request to:", toID);
    
        // verify availability
        const checkMsg = {
          avatarID: toID,
          attr: "status",
          requiredValue: "noChat",
          newValue: "inChat"
        };
        const result = await postData("checkAndUpdate", checkMsg).catch(e => {
          console.error("[CHAT] checkAndUpdate failed:", e);
          return null;
        });
    
        if (!result || result.error === "preconditionFailed") {
          toAvatar.setState("refuseChat");
          this.allowPointer = true;
          console.warn("[CHAT] Refused (busy)");
          return;
        }
    
        this.allowPointer = false;
    
        try {
          const res = await postData("chat/start", {
            fromAvatarID: this.myAvatar.ID,
            toAvatarID: toID,
            messageId: crypto.randomUUID()
          });
          this.currChat = new Chat(this.myAvatar, toAvatar, this);
          console.log("[CHAT] Started:", res.chatID);
        } catch (err) {
          console.error("[CHAT] start failed:", err);
          this.allowPointer = true;
        }
      }
    */

    async closeChat(fromID, toID) {
        if (!this.currChat) return;
        try {
            await postData("chat/end", {
                chatID: this.currChat.chatID,
                fromAvatarID: fromID,
                toAvatarID: toID
            });
            /*
            await Promise.all([
                patchData(fromID, "status", "noChat"),
                patchData(toID, "status", "noChat")
            ]);
            */
            console.log("[CHAT] Ended");
        } catch (e) {
            console.error("[CHAT] closeChat error:", e);
        } finally {
            this.currChat?.dispose?.();
            this.currChat = null;
            this.allowPointer = true;
            await this.periodicUpdate();
            this.startPeriodicUpdate();
        }
    }

    // ---------- DEAL & CHAT UPDATES ----------
    async dealDoneSelected(chatID, fromID, toID) {
        await this._sendDealResult(chatID, fromID, toID, "dealDone");
    }

    async dealNotDoneSelected(chatID, fromID, toID) {
        await this._sendDealResult(chatID, fromID, toID, "noDeal");
    }

    async _sendDealResult(chatID, fromID, toID, result) {
        try {
            await postData("chat/sendLine", {
                chatID,
                fromAvatarID: fromID,
                toAvatarID: toID,
                newLine: `[${result}]`
            });
            console.log("[CHAT] Deal result sent:", result);
        } catch (e) {
            console.error("[CHAT] dealResult failed:", e);
        }
    }

    async updateChat(chatID, fromID, toID, text) {
        try {
            await postData("chat/sendLine", {
                chatID,
                fromAvatarID: fromID,
                toAvatarID: toID,
                newLine: text
            });
            console.log("[CHAT] Line sent");
        } catch (e) {
            console.error("[CHAT] sendLine error:", e);
        }
    }

    chatStarted(fromID, toID) {
        console.log("[CHAT] Started between", fromID, toID);
    }

    chatUpdated(chatText, destID) {
        if (this.myAvatar.ID === destID && this.currChat) {
            this.currChat.updateText(chatText);
        }
    }

    dealResult(fromID, toID, senderAnswer, destAnswer) {
        if (!this.currChat) return;
        console.log("[CHAT] Deal result:", senderAnswer, destAnswer);
        if (senderAnswer === "dealDone" && destAnswer === "dealDone")
            this.currChat.setChatState("done");
        else if (senderAnswer === "noDeal" && destAnswer === "noDeal")
            this.currChat.setChatState("notDone");
        else this.currChat.setChatState("mixed");
    }

    chatEnded(fromID, toID, chatID) {
        console.log("[CHAT] End signal from", fromID, toID);
        if (this.currChat && this.currChat.chatID === chatID) {
            this.currChat.dispose();
            this.currChat = null;
            this.allowPointer = true;
            this.startPeriodicUpdate();
        }
        const fromA = this.idToAvatar(fromID);
        const toA = this.idToAvatar(toID);
        if (fromA) fromA.setState("noChat");
        if (toA) toA.setState("noChat");
    }

    doAvatarLeft(id) {
        console.log("[WORLD] Avatar left:", id);
        const a = this.idToAvatar(id);
        if (a) a.setDone();
    }

    doSetStatus(id, status) {
        const a = this.idToAvatar(id);
        if (a) a.setState(status);
    }

    safeStringifySkipMyWorld(obj) {
        const seen = new WeakSet();
        return JSON.stringify(obj, (k, v) => {
            if (k === "myWorld") return undefined;
            if (typeof v === "object" && v !== null) {
                if (seen.has(v)) return "[Circular]";
                seen.add(v);
            }
            return v;
        }, 2);
    }
}

// Export globally for index.html and message.js
window.World = World;
