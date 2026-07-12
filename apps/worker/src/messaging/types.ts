import type { MessageChannel } from "@brain/shared";

export interface InboundMessageContext {
  channel: MessageChannel;
  /** E.164 phone for SMS, chat id string for Telegram */
  senderId: string;
  body: string;
}

export interface OutboundTarget {
  channel: MessageChannel;
  /** E.164 phone for SMS, chat id string for Telegram */
  recipientId: string;
}
