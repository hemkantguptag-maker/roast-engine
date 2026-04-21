import { NextRequest, NextResponse } from "next/server";

type GeminiErrorBody = {
  error?: { message?: string; code?: number; status?: string };
};

type GeminiSuccessBody = {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
};

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number) {
  // 429 = quota/rate-limit, 500/503 = overloaded / high demand
  return status === 429 || status === 500 || status === 503;
}

async function callGemini(apiKey: string, prompt: string) {
  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    const data: unknown = await res.json();

    if (res.ok) {
      return data as GeminiSuccessBody;
    }

    const errBody = data as GeminiErrorBody;
    const msg =
      errBody.error?.message ??
      `Gemini HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`;

    if (isRetryable(res.status) && attempt < MAX_RETRIES) {
      const wait = RETRY_DELAY_MS * attempt;
      console.warn(
        `[api/roast] Gemini overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${wait}ms… — ${msg}`,
      );
      await sleep(wait);
      continue;
    }

    throw new Error(msg);
  }

  throw new Error("Gemini is currently overloaded. Please try again in a moment.");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const profileText =
      body && typeof body === "object" && "profileText" in body
        ? String((body as { profileText: unknown }).profileText ?? "").trim()
        : "";

    if (!profileText) {
      return NextResponse.json({ error: "Missing profileText" }, { status: 400 });
    }

    if (profileText.length < 40) {
      return NextResponse.json(
        { error: "Please paste a little more profile text" },
        { status: 422 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      return NextResponse.json(
        {
          error: "Server is missing GEMINI_API_KEY",
          hint: "Add GEMINI_API_KEY to .env.local in the project root and restart `npm run dev`.",
        },
        { status: 500 },
      );
    }

    const prompt =
      "You are a sarcastic, funny friend. Brutally roast the following LinkedIn profile or website text. CRUCIAL RULES:\n\n" +
      "Use very simple, basic, everyday words. No corporate jargon.\n\n" +
      "You must provide the roast in TWO parts. First, write the roast in simple English. Second, guess the person's native language based on their profile context (for example, if they seem to be from India, use highly relatable, funny Hinglish; if they are from Spain, use Spanish, etc. If you cannot guess, default to Hinglish).\n\n" +
      "Format your response EXACTLY like this with no extra text:\n" +
      "🇬🇧 The Global Roast: [Your simple English roast]\n" +
      "🌍 The Desi/Local Roast: [Your native language roast]\n\n" +
      profileText;

    const geminiData = await callGemini(apiKey, prompt);
    const text = geminiData.candidates[0].content.parts[0].text;

    return NextResponse.json({ roast: text });
  } catch (error) {
    console.error("GEMINI ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
