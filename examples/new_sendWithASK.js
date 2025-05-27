            async sendWithAck(payload, timeout = 750, messageId = null) {//60000 // 60 seconds
                console.log("sendWithAck payload:")
                console.log(payload);
                const id = messageId || `msg-${++this.counter}`;
                payload.messageId = id;

                return new Promise((resolve, reject) => {
                    this.pending.set(id, { resolve, reject });
                    this.socket.send(JSON.stringify(payload));//////socket.send
                    setTimeout(() => {
                        if (this.pending.has(id)) {
                            this.pending.delete(id);
                            reject(new Error("ACK timeout"));
                        }
                    }, timeout);
                });
            }

            async safeSend(data, maxRetries = 3, retryDelay = 500) {
                console.log("safeSend data:")
                console.log(data);
                const messageId = `msg-${++this.counter}`;
                data.messageId = messageId;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const result = await wsClient.sendWithAck(data, retryDelay, messageId); //return promise
                        return result;
                    } catch (error) {
                        console.warn(`Attempt ${attempt} failed:`, error);
                        if (attempt === maxRetries) {
                            //throw new Error("Failed after max retries");
                            //we can handle the error here (just by console it), to allow allowPointer in the calling function
                            console.error("Failed after max retries:", error);
                            return null; // or handle the error as needed
                        }
                        await new Promise(res => setTimeout(res, retryDelay * attempt));
                    }
                }
            }
