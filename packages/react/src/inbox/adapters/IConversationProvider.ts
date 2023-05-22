import {
  ConversationId,
  Markdown,
  Message,
  Participant,
  Wallet as WalletEntity,
} from '@lens-protocol/domain/entities';
import {
  EnableConversationsResult,
  GetAllConversationsResult,
} from '@lens-protocol/domain/use-cases/inbox';

export type EnableConversationsRequest = {
  participant: Participant;
};

export type FetchConversationsRequest = {
  participant: Participant;
};

export type FetchConversationRequest = {
  participant: Participant;
  conversationId: ConversationId;
};

export type CreateConversationRequest = {
  creator: Participant;
  peer: Participant;
};

export type FetchMessagesRequest = {
  conversationId: ConversationId;
  // TODO: add filters and pagination
};

export type SendMessageRequest = {
  participant: Participant;
  conversationId: ConversationId;
  message: Markdown;
};

export interface IConversationProvider {
  enableConversations(
    wallet: WalletEntity,
    request: EnableConversationsRequest,
  ): Promise<EnableConversationsResult>;

  fetchConversations(request: FetchConversationsRequest): Promise<GetAllConversationsResult>;

  // fetchConversation(request: FetchConversationRequest): Promise<Conversation | null>;
  // createConversation(request: CreateConversationRequest): Promise<Conversation>;
  fetchMessages(request: FetchMessagesRequest): Promise<Message[]>;
  // sendMessage(request: SendMessageRequest): Promise<Message>;
}
