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

async function callGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
) {
  const prompt =
    "You are a celebrity personal stylist creating a premium style report.\n" +
    "Analyze this outfit image and provide EXACTLY this format:\n\n" +
    "✨ Style Personality: What this outfit says about you in 2 sentences.\n\n" +
    "🎨 Color Analysis: What works, what clashes, what to add.\n\n" +
    "💪 What You're Doing Right: 3 things that actually work.\n\n" +
    "🗑️ What To Ditch: 3 specific items to remove or replace.\n\n" +
    "👗 10 Outfit Recommendations: Specific items with descriptions.\n\n" +
    "💎 Your Style Direction: 3 sentence personal style guide.\n\n" +
    "Keep it premium, specific, and actionable.";

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
  });

  let lastRetryDelayMs: number | null = null;

  for (const model of GEMINI_MODELS) {
    const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
          `[api/rewrite-fit] ${model} overloaded (attempt ${attempt}/${MAX_RETRIES}), retrying in ${wait}ms... - ${msg}`,
        );
        await sleep(wait);
        continue;
      }

      if (isRetryable(res.status)) {
        console.warn(
          `[api/rewrite-fit] ${model} stayed overloaded after ${MAX_RETRIES} attempts, trying next fallback model if available...`,
        );
        break;
      }

      throw new Error(msg);
    }
  }

  throw new Error(
    `Style report generation is temporarily busy. Please try again in about ${Math.ceil((lastRetryDelayMs ?? 30000) / 1000)} seconds.`,
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const imageBase64 =
      body && typeof body === "object" && "imageBase64" in body
        ? String((body as { imageBase64: unknown }).imageBase64 ?? "").trim()
        : "";
    const mimeType =
      body && typeof body === "object" && "mimeType" in body
        ? String((body as { mimeType: unknown }).mimeType ?? "").trim() ||
          "image/jpeg"
        : "image/jpeg";

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Missing imageBase64" },
        { status: 400 },
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

    const geminiData = await callGemini(apiKey, imageBase64, mimeType);
    const text = geminiData.candidates[0].content.parts[0].text;

    return NextResponse.json({ styleReport: text });
  } catch (error) {
    console.error("GEMINI ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
