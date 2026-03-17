export const agentChatSettings = {
  // Persist at most this many chat messages in localStorage.
  maxSavedMessages: 20,
  // Only the last N non-system messages are used as context when mapping a new prompt.
  contextWindowMessages: 2,
} as const;
