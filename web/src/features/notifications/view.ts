import { useApp } from "../../app/store";
import { isMobileViewport } from "../../shared/ui/useIsMobile";
import { useChats } from "../conversations/store";
import type { ConversationView } from "./suppress";

/** Snapshot of what the user is looking at, used to drop redundant notifications. */
export function currentConversationView(): ConversationView {
  const state = useApp.getState();
  const chats = state.activeProjectId ? useChats.getState().byProject[state.activeProjectId] : undefined;
  const compact = isMobileViewport();
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
  const onChatsScreen = !compact || state.mobileScreen === "bots";
  const activeChatId = !onChatsScreen
    ? null
    : compact
      ? chats?.activeChatId ?? null
      : activeTab?.kind === "ai"
        ? activeTab.chatId ?? null
        : null;
  return {
    // The compact shell only runs while the app is the visible Android window,
    // so visibility alone is enough there; desktop tabs also need focus.
    focused:
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      (compact || document.hasFocus()),
    chatsVisible: onChatsScreen,
    activeProjectId: state.activeProjectId,
    activeChatId,
    activeChatParticipantIds: chats?.chats.find((chat) => chat.id === activeChatId)?.participantIds,
  };
}
