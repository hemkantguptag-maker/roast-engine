import { NextRequest, NextResponse } from "next/server";
import { lemonSqueezySetup, createCheckout } from "@lemonsqueezy/lemonsqueezy.js";

export async function POST(request: NextRequest) {
  try {
    const apiKey =
      process.env.LEMON_SQUEEZY_API_KEY ?? process.env.LEMONSQUEEZY_API_KEY;
    const storeId =
      process.env.LEMON_SQUEEZY_STORE_ID ?? process.env.LEMONSQUEEZY_STORE_ID;

    if (!apiKey) {
      console.error(
        "[api/checkout] Lemon Squeezy API key is missing. " +
          "Add it to .env.local and restart `npm run dev`.",
      );
      return NextResponse.json(
        {
          error: "Server is missing Lemon Squeezy API key",
          hint:
            "Add LEMON_SQUEEZY_API_KEY to .env.local and restart `npm run dev`.",
        },
        { status: 500 },
      );
    }

    if (!storeId) {
      console.error(
        "[api/checkout] Lemon Squeezy store ID is missing. " +
          "Add it to .env.local and restart `npm run dev`.",
      );
      return NextResponse.json(
        {
          error: "Server is missing Lemon Squeezy store ID",
          hint:
            "Add LEMON_SQUEEZY_STORE_ID to .env.local and restart `npm run dev`.",
        },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => null);
    const variantId =
      body && typeof body === "object" && "variantId" in body
        ? String((body as { variantId: unknown }).variantId ?? "").trim()
        : "";

    if (!variantId) {
      return NextResponse.json({ error: "Missing variantId" }, { status: 400 });
    }

    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const requestOrigin =
      forwardedProto && forwardedHost
        ? `${forwardedProto}://${forwardedHost}`
        : request.nextUrl.origin;
    const appUrl =
      requestOrigin ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "http://localhost:3000";

    lemonSqueezySetup({ apiKey });

    const { data, error } = await createCheckout(storeId, variantId, {
      checkoutOptions: {
        embed: false,
      },
      productOptions: {
        redirectUrl: `${appUrl}/?success=true`,
      },
    });

    if (error) {
      console.error("LEMONSQUEEZY ERROR:", error);
      return NextResponse.json(
        { error: error.message ?? "Lemon Squeezy checkout creation failed" },
        { status: 502 },
      );
    }

    const checkoutUrl = data?.data?.attributes?.url;
    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "No checkout URL returned from Lemon Squeezy" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("LEMONSQUEEZY ERROR:", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
