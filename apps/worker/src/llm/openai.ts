import type { ExtractedIntent, ExtractedIntentPayload } from "@brain/shared";
import {
  EXTRACTOR_SYSTEM_PROMPT,
  REPLY_COMPOSER_SYSTEM_PROMPT,
  buildExtractorUserPrompt,
  buildReplyComposerPrompt,
  type CalendarContext,
  type ExtractorContext,
  type ReplyComposerData,
} from "@brain/shared";
import { extractedIntentSchema } from "@brain/shared";
import type { Env } from "../env.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatCompletion(
  env: Env,
  messages: OpenAIMessage[],
  jsonMode = false,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: 0.7,
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content?.trim() ?? "";
}

export async function extractIntent(
  env: Env,
  message: string,
  context: ExtractorContext = {},
): Promise<ExtractedIntent> {
  const messages: OpenAIMessage[] = [
    { role: "system", content: EXTRACTOR_SYSTEM_PROMPT },
  ];

  for (const turn of context.conversation_history ?? []) {
    messages.push({ role: turn.role, content: turn.text });
  }

  messages.push({
    role: "user",
    content: buildExtractorUserPrompt(message, context),
  });

  const raw = await chatCompletion(env, messages, true);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      intent: "unknown",
      entities: {},
      confidence: 0,
      missing_fields: [],
    };
  }

  const clarifyingQuestion =
    typeof parsed.clarifying_question === "string"
      ? parsed.clarifying_question
      : null;

  const base = extractedIntentSchema.safeParse({
    intent: parsed.intent,
    entities: parsed.entities ?? {},
    confidence: parsed.confidence ?? 0,
    missing_fields: parsed.missing_fields ?? [],
  });

  const intent: ExtractedIntent = base.success
    ? base.data
    : {
        intent: "unknown",
        entities: (parsed.entities as Record<string, unknown>) ?? {},
        confidence: 0,
        missing_fields: [],
      };

  if (clarifyingQuestion && !intent.missing_fields.length) {
    (intent as ExtractedIntent & { clarifying_question?: string }).clarifying_question =
      clarifyingQuestion;
  }

  return intent;
}

export async function composeReply(
  env: Env,
  intentResult: ExtractedIntentPayload,
  data: ReplyComposerData = {},
  calendarContext: CalendarContext = {},
): Promise<string> {
  const reply = await chatCompletion(env, [
    { role: "system", content: REPLY_COMPOSER_SYSTEM_PROMPT },
    {
      role: "user",
      content: buildReplyComposerPrompt(intentResult, data, calendarContext),
    },
  ]);

  return reply.slice(0, 320);
}
