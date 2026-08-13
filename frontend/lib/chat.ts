export const AI_PROVIDER_NOT_CONFIGURED_CODE = "AI_PROVIDER_NOT_CONFIGURED";

export const PROVIDER_HINT =
  "AI provider not configured. Add your API key in Settings to run agents.";

const GENERAL_ERROR =
  "Something went wrong while I was working. Please try again in a moment.";

const NOT_CONFIGURED =
  /AI_PROVIDER_NOT_CONFIGURED|llm_provider|provider mode|offline\s*\(\s*null\s*\)|\bnull provider\b|provider.*(?:is )?not configured|not configured.*provider|no (?:ai )?provider|add an api key|connect an api key/i;

export function isProviderNotConfiguredError(
  error: unknown,
): boolean {
  return (
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: string }).code === AI_PROVIDER_NOT_CONFIGURED_CODE) ||
    NOT_CONFIGURED.test(String((error as { detail?: string })?.detail ?? (error as Error)?.message ?? ""))
  );
}

const INTERNAL_ERROR =
  /error during execution|stopped after repeated tool failures|cannot run because the (?:llm )?provider|cannot run because the llm|traceback \(most recent call last\)/i;

const TECHNICAL_LINE =
  /^(?:environment|env|provider|model|llm)\s*[:=].*$/i;

const MODEL_TAG = /\[[a-z][a-z0-9_.-]{2,}\]/gi;

const NULL_PROVIDER_TAG = /\s*\(\s*null\s*\)/gi;

const MARKDOWN_ASTERISKS = /\*\*([^*]+)\*\*/g;

export function humanizeChatReply(text: string): string {
  if (!text || !text.trim()) return text;

  const cleaned = text.replace(MARKDOWN_ASTERISKS, "$1").trim();

  if (NOT_CONFIGURED.test(cleaned)) return PROVIDER_HINT;
  if (INTERNAL_ERROR.test(cleaned)) return GENERAL_ERROR;

  const lines = cleaned
    .split("\n")
    .map((line) =>
      line
        .replace(MODEL_TAG, "")
        .replace(NULL_PROVIDER_TAG, "")
        .replace(/^[\s>]+|[\s]+$/g, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .filter((line) => !TECHNICAL_LINE.test(line))
    .filter((line) => !/^(?:error|warning|info)\s*[:|]/i.test(line));

  return lines.length > 0 ? lines.join("\n") : cleaned;
}
