interface QuestionSessionClient {
  session: {
    background: (input: { sessionID: string }) => Promise<unknown>;
    prompt: (input: { sessionID: string; text: string; delivery: "steer" }) => Promise<unknown>;
  };
}

/** Continue a blocked question without interrupting the active agent turn. */
export async function answerOpenCodeQuestion(client: QuestionSessionClient, sessionID: string, answer: string): Promise<void> {
  await client.session.background({ sessionID }).catch(() => undefined);
  await client.session.prompt({ sessionID, text: answer, delivery: "steer" });
}
