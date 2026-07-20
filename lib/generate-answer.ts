import OpenAI from "openai";
import type { ChatMessage } from "@/lib/prompt";

export const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// Low temperature: answers must stay grounded in the retrieved passages, not
// wander. Retrieval + the system prompt do the work; the model shouldn't improvise.
const TEMPERATURE = 0.3;

const openai = new OpenAI(); // reads OPENAI_API_KEY from the environment

export type GeneratedAnswer = {
  answer: string;
  /** The model id the API actually served (may be a dated alias of CHAT_MODEL). */
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

/**
 * Call the OpenAI chat model with the prepared messages and return the answer
 * text plus token usage (persisted on ChatMessage in step 6). Throws on API
 * failure (after the SDK's built-in retries) so the route can surface a 502.
 */
export async function generateAnswer(
  messages: ChatMessage[],
): Promise<GeneratedAnswer> {
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: TEMPERATURE,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
  });

  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  return {
    answer,
    model: completion.model,
    inputTokens: completion.usage?.prompt_tokens ?? null,
    outputTokens: completion.usage?.completion_tokens ?? null,
  };
}
