import "server-only";

import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import type {
  Chat,
  DBMessage,
  Document,
  Suggestion,
  Stream,
  Vote,
} from "./schema";

const chatsStore = new Map<string, Chat>();
const messagesStore = new Map<string, DBMessage>();
const votesStore = new Map<string, Vote>();
const documentsStore = new Map<string, Document[]>();
const suggestionsStore = new Map<string, Suggestion[]>();
const streamsStore = new Map<string, Stream>();

function getVoteKey(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`;
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    chatsStore.set(id, {
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    for (const [key, vote] of votesStore) {
      if (vote.chatId === id) votesStore.delete(key);
    }
    for (const [msgId, msg] of messagesStore) {
      if (msg.chatId === id) messagesStore.delete(msgId);
    }
    for (const [streamId, s] of streamsStore) {
      if (s.chatId === id) streamsStore.delete(streamId);
    }
    const chat = chatsStore.get(id);
    chatsStore.delete(id);
    return chat;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChatIds: string[] = [];
    for (const [id, chat] of chatsStore) {
      if (chat.userId === userId) userChatIds.push(id);
    }

    if (userChatIds.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIdSet = new Set(userChatIds);

    for (const [key, vote] of votesStore) {
      if (chatIdSet.has(vote.chatId)) votesStore.delete(key);
    }
    for (const [msgId, msg] of messagesStore) {
      if (chatIdSet.has(msg.chatId)) messagesStore.delete(msgId);
    }
    for (const [streamId, s] of streamsStore) {
      if (chatIdSet.has(s.chatId)) streamsStore.delete(streamId);
    }

    let deletedCount = 0;
    for (const id of userChatIds) {
      if (chatsStore.delete(id)) deletedCount++;
    }

    return { deletedCount };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    let userChats = [...chatsStore.values()]
      .filter((chat) => chat.userId === id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (startingAfter) {
      const startChat = chatsStore.get(startingAfter);
      if (!startChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }
      userChats = userChats.filter(
        (c) => c.createdAt.getTime() > startChat.createdAt.getTime()
      );
    } else if (endingBefore) {
      const endChat = chatsStore.get(endingBefore);
      if (!endChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }
      userChats = userChats.filter(
        (c) => c.createdAt.getTime() < endChat.createdAt.getTime()
      );
    }

    const hasMore = userChats.length > extendedLimit - 1;

    return {
      chats: hasMore
        ? userChats.slice(0, limit)
        : userChats.slice(0, extendedLimit - 1),
      hasMore,
    };
  } catch (_error) {
    if (_error instanceof ChatbotError) throw _error;
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    return chatsStore.get(id) ?? null;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    for (const msg of messages) {
      messagesStore.set(msg.id, msg);
    }
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    const msg = messagesStore.get(id);
    if (msg) {
      messagesStore.set(id, { ...msg, parts });
    }
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return [...messagesStore.values()]
      .filter((msg) => msg.chatId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const key = getVoteKey(chatId, messageId);
    const existing = votesStore.get(key);
    if (existing) {
      votesStore.set(key, { ...existing, isUpvoted: type === "up" });
    } else {
      votesStore.set(key, { chatId, messageId, isUpvoted: type === "up" });
    }
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return [...votesStore.values()].filter((v) => v.chatId === id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    const doc: Document = {
      id,
      title,
      kind,
      content,
      userId,
      createdAt: new Date(),
    };
    const existing = documentsStore.get(id) ?? [];
    documentsStore.set(id, [...existing, doc]);
    return [doc];
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const versions = documentsStore.get(id);
    if (!versions || versions.length === 0) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    const latest = versions[versions.length - 1];
    const updated = { ...latest, content };
    documentsStore.set(id, [...versions.slice(0, -1), updated]);
    return [updated];
  } catch (_error) {
    if (_error instanceof ChatbotError) throw _error;
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const versions = documentsStore.get(id);
    if (!versions) return [];
    return [...versions].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const versions = documentsStore.get(id);
    if (!versions || versions.length === 0) return undefined;
    return [...versions].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    )[0];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    const versions = documentsStore.get(id);
    if (!versions) return [];

    const ts = timestamp.getTime();
    const remaining = versions.filter((v) => v.createdAt.getTime() <= ts);
    const deleted = versions.filter((v) => v.createdAt.getTime() > ts);

    documentsStore.set(id, remaining);

    for (const [sugId, sugList] of suggestionsStore) {
      suggestionsStore.set(
        sugId,
        sugList.filter((s) => !(s.documentId === id && s.documentCreatedAt.getTime() > ts))
      );
    }

    return deleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions: newSuggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    for (const sug of newSuggestions) {
      const existing = suggestionsStore.get(sug.documentId) ?? [];
      suggestionsStore.set(sug.documentId, [...existing, sug]);
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return suggestionsStore.get(documentId) ?? [];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    const msg = messagesStore.get(id);
    return msg ? [msg] : [];
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const ts = timestamp.getTime();
    const toDelete: string[] = [];

    for (const [msgId, msg] of messagesStore) {
      if (msg.chatId === chatId && msg.createdAt.getTime() >= ts) {
        toDelete.push(msgId);
      }
    }

    if (toDelete.length > 0) {
      const msgIdSet = new Set(toDelete);
      for (const [key, vote] of votesStore) {
        if (
          vote.chatId === chatId &&
          msgIdSet.has(vote.messageId)
        ) {
          votesStore.delete(key);
        }
      }
      for (const msgId of toDelete) {
        messagesStore.delete(msgId);
      }
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    const chat = chatsStore.get(chatId);
    if (chat) {
      chatsStore.set(chatId, { ...chat, visibility });
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    const chat = chatsStore.get(chatId);
    if (chat) {
      chatsStore.set(chatId, { ...chat, title });
    }
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    let count = 0;
    for (const msg of messagesStore.values()) {
      const chat = chatsStore.get(msg.chatId);
      if (
        chat?.userId === id &&
        msg.createdAt.getTime() >= cutoffTime.getTime() &&
        msg.role === "user"
      ) {
        count++;
      }
    }
    return count;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    streamsStore.set(streamId, {
      id: streamId,
      chatId,
      createdAt: new Date(),
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    return [...streamsStore.values()]
      .filter((s) => s.chatId === chatId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((s) => s.id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
