const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
// nvidia/llama-3.1-nemotron-70b-instruct is listed in the catalog but returns
// 404 ("Function not found for account") unless separately provisioned/
// deployed on your NVIDIA account. meta/llama-3.3-70b-instruct is callable
// but its full-length (1500 max_tokens) completions were unreliable in
// testing (90s+ timeouts). meta/llama-3.1-8b-instruct returns a full
// completion reliably in ~13s, so it's the default for responsiveness.
const MODEL = 'meta/llama-3.1-8b-instruct';
// A full non-streaming completion at max_tokens:1500 took ~13s in testing on
// meta/llama-3.1-8b-instruct — give it headroom beyond the PRD's 15s budget
// in case of a slow response, without leaving the user waiting forever.
const TIMEOUT_MS = 30000;

const STYLE_NOTES = {
  auto: 'Infer the task type (dev/build, writing, research, brainstorm, or general) and apply whichever additions below fit best.',
  builder: 'This is a development/build task. Include BUILDER ADDITIONS: desired tech stack assumptions, file/project structure, and an acceptance-criteria checklist.',
  writer: 'This is a writing task. Include WRITER ADDITIONS: tone, audience, target word count, format, and what NOT to write.',
  researcher: 'This is a research task. Define the scope precisely, specify source/credibility requirements, and define the output structure (sections, citations format).',
  brainstorm: 'This is a brainstorming task. Add divergent-thinking instructions, a quantity target for ideas, and explicitly invoke "no-filter" mode (include unconventional ideas, not just safe ones).'
};

function buildMetaPrompt(rawPrompt, style) {
  const styleNote = STYLE_NOTES[style] || STYLE_NOTES.auto;
  return `You are a world-class prompt engineer. Your job is to take a rough, vague user prompt and rewrite it into a detailed, structured, high-quality prompt that will produce a significantly better output from an AI assistant.

The user's original prompt:
"""
${rawPrompt}
"""

Enhancement style: ${style}
${styleNote}

Rewrite this into a detailed prompt following these rules:

1. PRESERVE INTENT — don't change what they're asking for, just make it far more specific
2. ADD CONTEXT — infer what domain/stack/use-case makes most sense and specify it clearly
3. DEFINE OUTPUT FORMAT — tell the AI exactly how to structure its response (step-by-step, code blocks, bullet lists, tables, etc.)
4. ADD CONSTRAINTS — specify what to avoid, edge cases to handle, depth/length expectations
5. SET THE PERSONA — tell the AI what expert role to assume (e.g. "You are a senior React engineer...")
6. BUILDER ADDITIONS (if dev task) — desired file structure, tech stack assumptions, acceptance criteria checklist
7. WRITER ADDITIONS (if writing task) — tone, audience, word count, format, what NOT to write
8. NO PREAMBLE — output only the enhanced prompt. Do not write "Here is your enhanced prompt:" or any wrapper text.

The enhanced prompt should be ready to paste directly into an AI chat interface and send.`;
}

class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function enhancePrompt(rawPrompt, style, apiKey) {
  if (!apiKey) {
    throw new ApiError('No API key configured', 'NO_KEY');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        temperature: 0.4,
        messages: [{ role: 'user', content: buildMetaPrompt(rawPrompt, style) }]
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out', 'TIMEOUT');
    }
    throw new ApiError(err.message || 'Network error', 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401) {
    throw new ApiError('Invalid API key', 'INVALID_KEY');
  }
  if (response.status === 429) {
    throw new ApiError('Rate limited', 'RATE_LIMITED');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(`API error ${response.status}: ${text}`, 'UNKNOWN');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new ApiError('Empty response from API', 'UNKNOWN');
  }
  return content.trim();
}

async function testApiKey(apiKey) {
  if (!apiKey) return { ok: false, code: 'NO_KEY', message: 'No API key configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'hi' }]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: 'INVALID_KEY', message: 'Invalid API key' };
    }
    if (response.status === 429) {
      return { ok: false, code: 'RATE_LIMITED', message: 'Rate limited' };
    }
    if (!response.ok) {
      return { ok: false, code: 'UNKNOWN', message: `API error ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') return { ok: false, code: 'TIMEOUT', message: 'Request timed out' };
    return { ok: false, code: 'NETWORK', message: err.message || 'Network error' };
  }
}

module.exports = { enhancePrompt, testApiKey, buildMetaPrompt, ApiError };
