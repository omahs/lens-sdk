import {
  Conversation,
  ConversationsDisabledError,
  EnableConversationsRequest,
  EnableConversationsResult,
  FetchConversationsRequest,
  GetAllConversationsResult,
  IConversationProvider,
  Participant,
  profileId as createProfileId,
  WalletEntity,
  EnvironmentConfig,
  ConversationId,
  Message,
  Markdown,
  FetchMessagesRequest,
} from '@lens-protocol/react';
import { failure, invariant, success } from '@lens-protocol/shared-kernel';
import { IStorage } from '@lens-protocol/storage';
import { Client, DecodedMessage, Conversation as XmtpConversation } from '@xmtp/xmtp-js';

import { extractPeerProfileId } from '../helpers';
import { SignerAdapter } from './SignerAdapter';

export class WebConversationProvider implements IConversationProvider {
  private client?: Client;

  constructor(
    private readonly environment: EnvironmentConfig,
    private readonly storage: IStorage<string>,
  ) {}

  private async storeKeys(keys: Uint8Array) {
    await this.storage.set(Uint8Array.from(keys).toString());
  }

  private async loadKeys(): Promise<Uint8Array | null> {
    const val = await this.storage.get();
    return val ? Uint8Array.from(val.split(',').map((c) => parseInt(c))) : null;
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      // try to create xmtp client from stored keys
      const keys = await this.loadKeys();

      if (keys) {
        this.client = await Client.create(null, {
          env: this.environment.xmtpEnv.name,
          privateKeyOverride: keys,
          persistConversations: true,
        });

        return this.client;
      }

      // if no keys stored
      throw new ConversationsDisabledError();
    }

    return this.client;
  }

  async enableConversations(
    wallet: WalletEntity,
    { participant }: EnableConversationsRequest,
  ): Promise<EnableConversationsResult> {
    // check if we can recreate client from the storage
    try {
      await this.getClient();
      return success({
        profileId: participant.profileId,
        address: wallet.address,
      });
    } catch (e) {
      // ignore
    }

    // if not, try to create client from the wallet
    try {
      const signer = new SignerAdapter(wallet);
      const keys = await Client.getKeys(signer, {
        env: this.environment.xmtpEnv.name,
        persistConversations: false,
        skipContactPublishing: true,
      });
      await this.storeKeys(keys);
      return success({
        profileId: participant.profileId,
        address: wallet.address,
      });
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore Error not yet properly typed
      return failure(e);
    }
  }

  async fetchConversations(request: FetchConversationsRequest): Promise<GetAllConversationsResult> {
    try {
      const client = await this.getClient();
      const xmtpConversations = await client.conversations.list();
      const convos = xmtpConversations.map((xmtpConversation: XmtpConversation) => {
        return this.buildConversation(xmtpConversation, request.participant);
      });

      return success(convos);
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore Error not yet properly typed
      return failure(e);
    }
  }

  async fetchMessages(request: FetchMessagesRequest): Promise<Message[]> {
    const xmtpConversations = await this.getXmtpConversations([request.conversationId]);
    const xmtpConversation = xmtpConversations[0];

    invariant(xmtpConversation, 'Conversation not found');

    const messages = await xmtpConversation.messages();

    return messages.map((decodedMessage: DecodedMessage) => {
      return {
        id: decodedMessage.id,
        conversationId: xmtpConversation.topic,
        content: decodedMessage.content as Markdown,
        reactions: [],
        sentAt: decodedMessage.sent,
        sender: {
          profileId: undefined, // TODO: extract sender profileId
          address: decodedMessage.senderAddress,
        },
      };
    });
  }

  private buildConversation(
    xmtpConversation: XmtpConversation,
    activeParticipant: Participant,
  ): Conversation {
    const conversationId = xmtpConversation.context?.conversationId;
    const activeProfileId = activeParticipant.profileId;

    const peerProfileId =
      conversationId && activeProfileId && this.isLensConversation(activeProfileId, conversationId)
        ? extractPeerProfileId(conversationId, activeProfileId)
        : undefined;

    return {
      id: xmtpConversation.topic,
      peer: {
        profileId: peerProfileId ? createProfileId(peerProfileId) : undefined,
        address: xmtpConversation.peerAddress,
      },
      me: {
        profileId: activeProfileId,
        address: xmtpConversation.clientAddress,
      },
    };
  }

  private isLensConversation(
    activeProfileId: string,
    conversationId?: string,
  ): conversationId is string {
    if (conversationId && conversationId.includes(activeProfileId)) {
      return true;
    }
    return false;
  }

  private async getXmtpConversations(
    conversationIds: ConversationId[],
  ): Promise<XmtpConversation[]> {
    const client = await this.getClient();
    const allXmtpConversations = await client.conversations.list();

    return allXmtpConversations.filter((xmtpConversation) => {
      return conversationIds.some((id) => id === xmtpConversation.topic);
    });
  }
}
