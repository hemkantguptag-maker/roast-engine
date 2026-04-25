import { NextRequest, NextResponse } from "next/server";

type GeminiErrorBody = {
  error?: { message?: string; code?: number; status?: string };
};

type GeminiSuccessBody = {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
  }>;
};

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number) {
  // 429 = quota/rate-limit, 500/503 = overloaded / high demand
  return status === 429 || status === 500 || status === 503;
}

function getRetryDelayMs(message: string) {
  const match = message.match(/Please retry in ([\d.]+)s/i);
  if (!match) {
    return null;
  }

  const seconds = Number(match[1]);
  if (Number.isNaN(seconds)) {
    return null;
  }

  return Math.ceil(seconds * 1000);
}

async function callGemini(apiKey: string, prompt: string) {
  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
  });
  let lastRetryDelayMs: number | null = null;

  for (const model of GEMINI_MODELS) {
    const modelUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(modelUrl, {
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
        const wait = getRetryDelayMs(msg) ?? RETRY_DELAY_MS * attempt;
        lastRetryDelayMs = wait;
        console.warn(
          `[api/roast] ${model} unavailable (attempt ${attempt}/${MAX_RETRIES}), retrying in ${wait}ms... - ${msg}`,
        );
        await sleep(wait);
        continue;
      }

      if (isRetryable(res.status)) {
        console.warn(
          `[api/roast] ${model} stayed unavailable after ${MAX_RETRIES} attempts, trying next fallback model if available...`,
        );
        break;
      }

      throw new Error(msg);
    }
  }

  throw new Error(
    `Roast generation is temporarily busy. Please try again in about ${Math.ceil((lastRetryDelayMs ?? 30000) / 1000)} seconds.`,
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const profileText =
      body && typeof body === "object" && "profileText" in body
        ? String((body as { profileText: unknown }).profileText ?? "").trim()
        : "";
    const roastLanguage =
      body && typeof body === "object" && "roastLanguage" in body
        ? String((body as { roastLanguage: unknown }).roastLanguage ?? "").trim() ||
          "English (Default)"
        : "English (Default)";

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
      "You are a ruthless Silicon Valley recruiter. Brutally roast the following LinkedIn profile or resume text. CRUCIAL RULES:\n\n" +
      "Make the output highly screenshot-able for social media.\n\n" +
      "Specifically hunt for and mock overused buzzwords, missing metrics, passive voice, and boring corporate jargon.\n\n" +
      "The tone must be sharp, highly sarcastic, witty, and brutally specific.\n\n" +
      "Format the response EXACTLY in these 3 parts:\n\n" +
      "Part 1: A short, brutally sarcastic paragraph destroying their profile.\n\n" +
      "Part 2: A bulleted list titled '🚨 Top 3 Resume Sins:' pointing out their worst jargon, missing metrics, or boring phrasing.\n\n" +
      "Part 3: A final snappy sentence telling them to buy the Elite Rewrite to save their career.\n\n" +
      "Do not include any extra commentary outside those 3 parts.\n\n" +
      profileText +
      `\n\nCRITICAL RULE: You must generate this entire roast in: ${roastLanguage}. If a regional language (like Hindi, Telugu, Tamil, Hinglish, etc.) is selected, DO NOT use formal translation. You MUST use heavy local internet slang, modern pop-culture phrasing, and savage street-style humor to make it highly viral and relatable. If English or Spanish is selected, use a brutal, aggressive tech-bro tone.`;

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
