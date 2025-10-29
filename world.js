// world.js
// Client-side world controller for Babylon.js “carShare”
// HTTP-first flow with optional WS nudges (not required for correctness)

(() => {
  // ====== CONFIG ======
  const POLL_MS_IDLE = 5000;
  const POLL_MS_ACTIVE = 1500;


  // ====== WORLD CLASS ======
  class World {
    constructor(opts = {}) {
      // External hooks / UI
      this.scene = opts.scene || null;
      this.uiToast = opts.uiToast || null; // function .show(msg)

      // My identity in the world
      this.avatarID = opts.avatarID || null; // set by your login/bootstrap
      this.userNameFrom = opts.userNameFrom || null;

      // Avatars currently known (map avatarID -> avatarData)
      this.avatarsMap = new Map();
      // Optional: signs cache
      this.signsMap = new Map();

      // Current open chat (single for now)
      this.currChat = null;

      // Poll loop
      this._pollTimer = null;
      this._lastPollAt = 0;
      this._isActiveChat = false;

      // Bind if needed
      this.periodicUpdate = this.periodicUpdate.bind(this);
    }

    // ---------- Bootstrap ----------
    async start() {
      // Kick off periodic polling
      this._scheduleNextPoll(250);
    }

    // ---------- Poll scheduler ----------
    _scheduleNextPoll(ms) {
      if (this._pollTimer) clearTimeout(this._pollTimer);
      this._pollTimer = setTimeout(this.periodicUpdate, ms);
    }

    _currentPollInterval() {
      // faster while in chat
      return this._isActiveChat ? POLL_MS_ACTIVE : POLL_MS_IDLE;
    }

    // ---------- Main periodic pull ----------
    async periodicUpdate() {
      try {
        const data = await getData("getAllStatuses");
        const { signs = [], avatars = [] } = data || {};

        // 1) Process AVATARS FIRST (UI may mark states)
        this._applyAvatars(avatars);

        // 2) Process SIGNS SECOND (authoritative for loading/noChat visual if you prefer)
        this._applySigns(signs);

        // 3) After both applied, decide if I (callee) should open a chat window
        this._maybeAutoOpenChatForSelf();

        // 4) Track whether we are in active chat state (affects poll cadence)
        const me = this.avatarsMap.get(this.avatarID);
        this._isActiveChat = !!(me && me.status === "inChat");

      } catch (err) {
        console.error("periodicUpdate error:", err);
      } finally {
        console.log("CC- periodicUpdate: End");
        this._scheduleNextPoll(this._currentPollInterval());
      }
    }

    // ---------- Apply avatars from server ----------
    _applyAvatars(avatarItems) {
      // Build/update the map
      for (const it of avatarItems) {
        const id = it.avatarID;
        if (!id) continue;
        this.avatarsMap.set(id, { ...this.avatarsMap.get(id), ...it });

        // Drive avatar visuals if you keep instances on scene
        const avatarObj = this._getAvatarInstance(id);
        if (avatarObj && typeof avatarObj.setState === "function") {
          avatarObj.setState(it.status || "loading");
        }
      }

      // Optionally prune avatars not present anymore
      // (Not necessary if the server keeps them until stale)
    }

    // ---------- Apply signs from server ----------
    _applySigns(signItems) {
      for (const s of signItems) {
        const id = s.avatarID || s.id || s.ownerID;
        if (!id) continue;
        this.signsMap.set(id, { ...this.signsMap.get(id), ...s });

        // If signs are authoritative for “loading/noChat” UI:
        const avatarObj = this._getAvatarInstance(id);
        if (avatarObj && typeof avatarObj.setState === "function") {
          // Only override for loading/noChat states
          if (s.isLoading === true) avatarObj.setState("loading");
          if (s.isLoading === false) avatarObj.setState("noChat");
        }
      }
    }

    // ---------- Decide if callee should open the chat on this poll ----------
    _maybeAutoOpenChatForSelf() {
      if (this.currChat) return; // already open

      const me = this.avatarsMap.get(this.avatarID);
      if (!me) return;

      if (me.status === "inChat" && me.partnerID && me.chatID) {
        // Callee-side auto-open (or caller recovering from refresh)
        this.currChat = new Chat({
          world: this,
          chatID: me.chatID,
          partnerID: me.partnerID,
          isCaller: false
        });
      }
    }

    // ---------- CALLER PATH: start a chat with a target avatar ----------
    async chatRequest(targetAvatarID) {
      if (!this.avatarID || !targetAvatarID) return;

      try {
        // HTTP-authoritative start (no WS dependency)
        const res = await postData("chat/start", {
          fromAvatarID: this.avatarID,
          toAvatarID: targetAvatarID,
          messageId: crypto.randomUUID()
        });

        // Success → open immediately on caller
        this.currChat = new Chat({
          world: this,
          chatID: res.chatID,
          partnerID: targetAvatarID,
          isCaller: true
        });

      } catch (err) {
        // Standardized codes/messages
        if (err.status === 409) {
          switch (err.details?.error) {
            case "callerBusy":
              this._toast("You’re already in a chat.");
              break;
            case "calleeBusy":
              this._toast("The other user is busy.");
              break;
            case "selfChat":
              this._toast("You can’t chat with yourself.");
              break;
            case "conflict":
              this._toast("Race condition — try again.");
              break;
            default:
              this._toast("Couldn’t start chat.");
          }
        } else if (err.status === 404) {
          this._toast("User not found.");
        } else if (err.status === 400) {
          this._toast("Bad request.");
        } else {
          this._toast("Server error.");
        }
        console.warn("chatRequest failed:", err);
      }
    }

    // ---------- Close chat (client action) ----------
    async closeChat(partnerAvatarID) {
      if (!this.currChat) return;
      const chatID = this.currChat.chatID || null;

      try {
        if (chatID && partnerAvatarID) {
          await postData("chat/end", {
            chatID,
            fromAvatarID: this.avatarID,
            toAvatarID: partnerAvatarID
          });
        }
      } catch (err) {
        console.warn("closeChat error:", err);
        // Optional fallback: force local state via patch if needed
        try {
          await Promise.all([
            patchData(this.avatarID, "status", "noChat"),
            patchData(this.avatarID, "partnerID", null),
            patchData(this.avatarID, "chatID", null)
          ]);
        } catch (e2) {
          console.warn("fallback patches failed:", e2);
        }
      } finally {
        // Always tear down local UI
        try { this.currChat?.dispose?.(); } catch (_) {}
        this.currChat = null;
      }
    }

    // ---------- Helpers ----------
    _getAvatarInstance(avatarID) {
      // Integrate with your scene’s avatar registry if you have one.
      // For now, assume avatar.js stores instances on a global map.
      if (window.CS_AVATARS && window.CS_AVATARS.get) {
        return window.CS_AVATARS.get(avatarID);
      }
      return null;
    }

    _toast(msg) {
      if (this.uiToast && typeof this.uiToast.show === "function") {
        this.uiToast.show(msg);
      } else {
        console.log("[Toast]", msg);
      }
    }
  }

  // Expose to global
  window.World = World;
  window.cs_postData = postData;   // optional export if others use it
  window.cs_getData = getData;
  window.cs_patchData = patchData;
})();
