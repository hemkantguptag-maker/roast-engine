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
          `[api/rewrite] ${model} overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${wait}ms... - ${msg}`,
        );
        await sleep(wait);
        continue;
      }

      if (isRetryable(res.status)) {
        console.warn(
          `[api/rewrite] ${model} stayed overloaded after ${MAX_RETRIES} attempts, trying next fallback model if available...`,
        );
        break;
      }

      throw new Error(msg);
    }
  }

  throw new Error(
    `Rewrite generation is temporarily busy. Please try again in about ${Math.ceil((lastRetryDelayMs ?? 30000) / 1000)} seconds.`,
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const profileText =
      body && typeof body === "object" && "profileText" in body
        ? String((body as { profileText: unknown }).profileText ?? "").trim()
        : "";

    if (!profileText) {
      return NextResponse.json(
        { error: "Missing profileText" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey?.trim()) {
      return NextResponse.json(
        {
          error: "Server is missing GEMINI_API_KEY",
          hint:
            "Add GEMINI_API_KEY to .env.local in the project root and restart `npm run dev`.",
        },
        { status: 500 },
      );
    }

    const prompt =
      "You are an elite executive career coach and resume writer. Rewrite the following LinkedIn profile text to make it sound highly professional, impactful, and attractive to top-tier recruiters. Fix any bad grammar, highlight key achievements, and format it beautifully using paragraphs and bullet points. Do not include any conversational filler; only return the final rewritten profile.\n\n" +
      profileText;

    const geminiData = await callGemini(apiKey, prompt);
    const text = geminiData.candidates[0].content.parts[0].text;

    return NextResponse.json({ rewrite: text });
  } catch (error) {
    console.error("GEMINI ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
