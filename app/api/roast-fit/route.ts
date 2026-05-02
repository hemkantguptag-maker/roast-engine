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
  roastLanguage: string,
) {
  const prompt =
    `You are a savage but secretly helpful fashion critic.\n` +
    `Look at this outfit photo carefully.\n\n` +
    `Format response in EXACTLY 2 parts:\n` +
    `Part 1: Roast this outfit in 3 short punchy brutal lines.\n` +
    `Part 2: titled '👗 Glow Up Tips:' give 3 specific actionable style improvements.\n\n` +
    `Make it screenshot-worthy for social media.\n\n` +
    `CRITICAL RULE: Respond entirely in: ${roastLanguage}\n` +
    `Use same slang rules as: if regional Indian language use heavy local internet slang and savage street humor. If English use brutal fashion-critic tone.`;

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
          `[api/roast-fit] ${model} unavailable (attempt ${attempt}/${MAX_RETRIES}), retrying in ${wait}ms... - ${msg}`,
        );
        await sleep(wait);
        continue;
      }

      if (isRetryable(res.status)) {
        console.warn(
          `[api/roast-fit] ${model} stayed unavailable after ${MAX_RETRIES} attempts, trying next fallback model if available...`,
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

    const imageBase64 =
      body && typeof body === "object" && "imageBase64" in body
        ? String((body as { imageBase64: unknown }).imageBase64 ?? "").trim()
        : "";
    const mimeType =
      body && typeof body === "object" && "mimeType" in body
        ? String((body as { mimeType: unknown }).mimeType ?? "").trim() ||
          "image/jpeg"
        : "image/jpeg";
    const roastLanguage =
      body && typeof body === "object" && "roastLanguage" in body
        ? String(
            (body as { roastLanguage: unknown }).roastLanguage ?? "",
          ).trim() || "English (Default)"
        : "English (Default)";

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

    const geminiData = await callGemini(
      apiKey,
      imageBase64,
      mimeType,
      roastLanguage,
    );
    const text = geminiData.candidates[0].content.parts[0].text;

    return NextResponse.json({ roast: text });
  } catch (error) {
    console.error("GEMINI ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
