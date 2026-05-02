"use client";

import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";

type SavedFitSession = {
  roast: string | null;
  styleReport: string | null;
};

const ROAST_LANGUAGE_OPTIONS = [
  "Hinglish (Viral) 🔥",
  "English (Default)",
  "Hindi",
  "Telugu",
  "Tamil",
  "Marathi",
  "Kannada",
  "Spanish",
] as const;

type RoastLanguage = (typeof ROAST_LANGUAGE_OPTIONS)[number];

const SESSION_STORAGE_KEY = "brutal-fit-roast-session";
const SAVED_IMAGE_BASE64_KEY = "savedFitImageBase64";
const SAVED_IMAGE_MIME_KEY = "savedFitImageMime";
const SAVED_ROAST_RESULT_KEY = "savedFitRoastResult";

const FIT_TESTIMONIALS = [
  {
    name: "Ananya K.",
    location: "Delhi",
    role: "College Student",
    text: "Uploaded my date outfit as a joke. The report told me exactly what to change. He said I looked amazing. Coincidence? I think not 😂",
    emoji: "💕",
    verified: true,
  },
  {
    name: "Vikram S.",
    location: "Pune",
    role: "Sales Professional",
    text: "Started wearing what the style report suggested to client meetings. Closed 2 deals that week. Dressing right actually works.",
    emoji: "💼",
    verified: true,
  },
  {
    name: "Sarah L.",
    location: "Dubai",
    role: "Content Creator",
    text: "My Instagram engagement went up after I started following the color and style recommendations. People notice when you dress with intention.",
    emoji: "📸",
    verified: true,
  },
  {
    name: "Meera P.",
    location: "Chennai",
    role: "HR Manager",
    text: "Thought it would be a funny app. Ended up completely rethinking my work wardrobe. Best ₹99 I ever spent honestly.",
    emoji: "✨",
    verified: true,
  },
];

const FIT_FAQS = [
  {
    q: "What kind of photos work best?",
    a: "Full body photos in decent lighting work best. Mirror selfies, outdoor shots, and event photos all work great. Avoid very dark or blurry images.",
  },
  {
    q: "Is my photo stored or used for AI training?",
    a: "No. Your photo is processed in real-time and immediately discarded. We never store, share, or use your images for any purpose.",
  },
  {
    q: "What does the Style Makeover Report include?",
    a: "A complete style analysis including your style personality, color analysis, what you are doing right, what to ditch, 10 specific outfit recommendations, and a personal style direction guide. Worth every penny.",
  },
  {
    q: "Can I upload a photo of my friend?",
    a: "Yes! Roasting a friend's outfit is even more fun. Just make sure to share the roast with them 😈",
  },
  {
    q: "Can I get a refund?",
    a: "Yes. If you are not satisfied with your style report, email us for a full refund. No questions.",
  },
];

function getRetrySeconds(message: string | null) {
  if (!message) {
    return null;
  }

  const match = message.match(/about\s+(\d+)\s+seconds?/i);
  if (!match) {
    return null;
  }

  const seconds = Number(match[1]);
  return Number.isNaN(seconds) ? null : seconds;
}

export default function RoastMyFit() {
  // imagePreviewUrl: object URL when file is freshly selected, data URL when restored from localStorage
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  // imageBase64: raw base64 string (no data: prefix) sent to the API and persisted
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [roast, setRoast] = useState<string | null>(null);
  const [styleReport, setStyleReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [roastLanguage, setRoastLanguage] =
    useState<RoastLanguage>("Hinglish (Viral) 🔥");
  const [copiedShare, setCopiedShare] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URLs on change to avoid memory leaks
  useEffect(() => {
    return () => {
      if (imagePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  // Restore session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHasPaid(params.get("success") === "true");

    const savedBase64 = window.localStorage.getItem(SAVED_IMAGE_BASE64_KEY);
    const savedMime =
      window.localStorage.getItem(SAVED_IMAGE_MIME_KEY) ?? "image/jpeg";
    if (savedBase64) {
      setImageBase64(savedBase64);
      setImageMimeType(savedMime);
      setImagePreviewUrl(`data:${savedMime};base64,${savedBase64}`);
    }

    const savedRoast = window.localStorage.getItem(SAVED_ROAST_RESULT_KEY);

    const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedFitSession;
        const restoredRoast = parsed.roast ?? savedRoast ?? null;
        setRoast(restoredRoast);
        setStyleReport(parsed.styleReport ?? null);
        setResultsVisible(Boolean(restoredRoast || parsed.styleReport));
      } catch {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
        if (savedRoast) {
          setRoast(savedRoast);
          setResultsVisible(true);
        }
      }
    } else if (savedRoast) {
      setRoast(savedRoast);
      setResultsVisible(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function detectCountry() {
      try {
        const res = await fetch("https://get.geojs.io/v1/ip/country.json");
        const data: unknown = await res.json().catch(() => null);
        const country =
          data &&
          typeof data === "object" &&
          "country" in data &&
          typeof (data as { country: unknown }).country === "string"
            ? (data as { country: string }).country
            : null;

        if (!cancelled) {
          setUserCountry(country || "GLOBAL");
        }
      } catch {
        if (!cancelled) {
          setUserCountry("GLOBAL");
        }
      }
    }

    void detectCountry();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const seconds = getRetrySeconds(error);
    setRetryCountdown(seconds);
  }, [error]);

  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRetryCountdown((current) =>
        current !== null && current > 0 ? current - 1 : current,
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [retryCountdown]);

  function persistSession(next: SavedFitSession) {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  }

  function saveBase64ToLocalStorage(base64: string, mimeType: string) {
    try {
      window.localStorage.setItem(SAVED_IMAGE_BASE64_KEY, base64);
      window.localStorage.setItem(SAVED_IMAGE_MIME_KEY, mimeType);
    } catch {
      // Storage quota exceeded — proceed without persistence
    }
  }

  const showRetryCountdown = retryCountdown !== null && retryCountdown > 0;

  function handleImageSelect(file: File) {
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB. Please compress it and try again.");
      return;
    }

    setError(null);
    setImageMimeType(file.type);

    // Object URL for fast preview display
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);

    // FileReader to get base64 for API calls and localStorage persistence
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(",")[1];
      setImageBase64(base64);
      saveBase64ToLocalStorage(base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(true);
  }

  function handleDragLeave() {
    setIsDraggingOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    void runRoast();
  }

  function getDefaultShareText(roastText: string) {
    const roastPreview = roastText.slice(0, 80);
    return `AI just destroyed my outfit \u{1F62D}\u{1F457}\n${roastPreview}...\nGet yours roasted: https://myroastengine.com/roast-my-fit`;
  }

  async function handleCopyRoast(roastText: string) {
    try {
      await navigator.clipboard.writeText(getDefaultShareText(roastText));
      setCopiedShare(true);
      window.setTimeout(() => setCopiedShare(false), 2000);
    } catch {
      setError("Could not copy roast. Try again.");
    }
  }

  function handleShareOnX(roastText: string) {
    const shareText = encodeURIComponent(getDefaultShareText(roastText));
    window.open(`https://twitter.com/intent/tweet?text=${shareText}`, "_blank");
  }

  function handleShareOnWhatsApp(roastText: string) {
    const shareText = encodeURIComponent(getDefaultShareText(roastText));
    window.open(`https://wa.me/?text=${shareText}`, "_blank");
  }

  function handleShareOnThreads(roastText: string) {
    const shareText = encodeURIComponent(getDefaultShareText(roastText));
    window.open(
      `https://www.threads.net/intent/post?text=${shareText}`,
      "_blank",
    );
  }

  function handleShareOnLinkedIn() {
    window.open(
      "https://www.linkedin.com/sharing/share-offsite/?url=https://myroastengine.com/roast-my-fit",
      "_blank",
    );
  }

  async function handleCheckout() {
    const variantId =
      userCountry === "IN"
        ? process.env.NEXT_PUBLIC_LEMON_SQUEEZY_FIT_INDIA_VARIANT_ID
        : process.env.NEXT_PUBLIC_LEMON_SQUEEZY_FIT_GLOBAL_VARIANT_ID;

    if (!variantId) {
      setError(
        `Missing variant ID for ${userCountry === "IN" ? "India" : "global"} checkout. Check your .env.local.`,
      );
      return;
    }

    persistSession({ roast, styleReport });

    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId }),
      });
      const data: unknown = await res.json().catch(() => null);
      const checkoutUrl =
        data &&
        typeof data === "object" &&
        "url" in data &&
        typeof (data as { url: unknown }).url === "string"
          ? (data as { url: string }).url
          : null;

      if (!res.ok || !checkoutUrl) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not start checkout. Try again.";
        setError(msg);
        return;
      }

      window.location.href = checkoutUrl;
    } catch {
      setError("Network error starting checkout. Check your connection.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleGenerateReport() {
    if (isGeneratingReport) {
      return;
    }

    const restoredBase64 =
      imageBase64 ?? window.localStorage.getItem(SAVED_IMAGE_BASE64_KEY);
    const restoredMime =
      imageMimeType !== "image/jpeg"
        ? imageMimeType
        : (window.localStorage.getItem(SAVED_IMAGE_MIME_KEY) ?? "image/jpeg");

    if (!restoredBase64) {
      setError(
        "Please re-upload your outfit photo to generate the style report.",
      );
      return;
    }

    if (!imageBase64) {
      setImageBase64(restoredBase64);
      setImageMimeType(restoredMime);
      setImagePreviewUrl(`data:${restoredMime};base64,${restoredBase64}`);
    }

    setError(null);
    setIsGeneratingReport(true);

    const nextUrl = new URL(window.location.href);
    if (nextUrl.searchParams.has("success")) {
      nextUrl.searchParams.delete("success");
      window.history.replaceState({}, "", nextUrl.toString());
    }

    try {
      const res = await fetch("/api/rewrite-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: restoredBase64,
          mimeType: restoredMime,
        }),
      });

      const data: unknown = await res.json().catch(() => null);
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : null;

      if (!res.ok) {
        setError(message ?? "Could not generate your style report. Try again.");
        return;
      }

      const report =
        data &&
        typeof data === "object" &&
        "styleReport" in data &&
        typeof (data as { styleReport: unknown }).styleReport === "string"
          ? (data as { styleReport: string }).styleReport.trim()
          : null;

      if (!report) {
        setError("No style report in response.");
        return;
      }

      setStyleReport(report);
      persistSession({ roast, styleReport: report });
    } catch {
      setError("Network error generating your style report. Try again.");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function runRoast() {
    if (!imageBase64) {
      setError("Please upload an outfit photo first.");
      return;
    }

    setError(null);
    setRoast(null);
    setStyleReport(null);
    setLoading(true);

    try {
      const res = await fetch("/api/roast-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: imageMimeType,
          roastLanguage,
        }),
      });

      const data: unknown = await res.json().catch(() => null);
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : null;

      if (!res.ok) {
        setError(message ?? "Something went wrong. Try again.");
        setResultsVisible(true);
        return;
      }

      const roastText =
        data &&
        typeof data === "object" &&
        "roast" in data &&
        typeof (data as { roast: unknown }).roast === "string"
          ? (data as { roast: string }).roast.trim()
          : null;

      if (!roastText) {
        setError("No roast in response.");
        setResultsVisible(true);
        return;
      }

      setRoast(roastText);
      setResultsVisible(true);
      window.localStorage.setItem(SAVED_ROAST_RESULT_KEY, roastText);
      persistSession({ roast: roastText, styleReport: null });
    } catch {
      setError("Network error. Check your connection and try again.");
      setResultsVisible(true);
    } finally {
      setLoading(false);
    }
  }

  function handleChallengeWhatsApp() {
    const msg = encodeURIComponent(
      "Bro AI just destroyed my outfit 😭👗 " +
        "It was SAVAGE. Bet your fit is worse 👀 " +
        "Try it: https://myroastengine.com/roast-my-fit",
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  }

  return (
    <div className="relative min-h-full flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <nav className="relative z-20 flex justify-center gap-3 pt-6 pb-2">
        <a
          href="/"
          className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          💼 Roast My LinkedIn
        </a>
        <a
          href="/roast-my-fit"
          className="rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/20 transition-colors"
        >
          👗 Roast My Fit
        </a>
      </nav>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(249,115,22,0.18),transparent),radial-gradient(ellipse_60%_40%_at_100%_50%,rgba(244,63,94,0.08),transparent),radial-gradient(ellipse_50%_35%_at_0%_80%,rgba(234,179,8,0.06),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(9,9,11,0.85))]"
      />

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 sm:py-24">
        <header className="mb-10 text-center sm:mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-50 sm:text-5xl sm:leading-tight">
            Are You Accidentally Dressing Wrong
            <br />
            For Your Goals? {"\u{1F457}"}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-3 mb-2">
            <span className="text-orange-400 text-sm font-semibold">
              👗 3,200+ outfits roasted
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400 text-sm">⭐⭐⭐⭐⭐ 4.8/5</span>
          </div>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            Upload your outfit photo. AI tells you exactly what is working
            against you — for free. Then unlock your personal celebrity stylist
            report to dress with real confidence.
          </p>
          <p className="text-center text-sm text-zinc-500 mt-2">
            Free roast · Full style report from
            <span className="text-amber-400 font-medium"> $4.99</span>
            <span className="text-zinc-600"> / </span>
            <span className="text-amber-400 font-medium">₹99 for India</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              ⚡ 23 outfits analyzed in the last 24 hours
            </span>
          </div>
        </header>

        {!imageBase64 ? (
          <div className="w-full max-w-md mb-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-center">
                <div className="text-2xl font-bold text-orange-400">3K+</div>
                <div className="text-xs text-zinc-500 mt-1">Outfits Analyzed</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">91%</div>
                <div className="text-xs text-zinc-500 mt-1">Felt More Confident</div>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-center">
                <div className="text-2xl font-bold text-sky-400">4.8★</div>
                <div className="text-xs text-zinc-500 mt-1">Average Rating</div>
              </div>
            </div>
          </div>
        ) : null}

        <form
          className="w-full max-w-md space-y-5"
          method="post"
          onSubmit={handleFormSubmit}
        >
          {!imageBase64 ? (
            <div className="w-full mb-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider text-center mb-3">
                What&apos;s included in your free analysis
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "🎯 Brutal honest feedback",
                  "👗 3 specific glow-up tips",
                  "🎨 Color clash detection",
                  "📱 Screenshot & share worthy",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2 text-xs text-zinc-400"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={`relative flex min-h-[200px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors sm:min-h-[220px] ${
              isDraggingOver
                ? "border-orange-500 bg-orange-500/10"
                : imagePreviewUrl
                  ? "border-zinc-700 bg-zinc-900/80"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            aria-label="Upload outfit photo"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
                e.target.value = "";
              }}
            />
            {imagePreviewUrl ? (
              <div className="flex w-full flex-col items-center gap-2 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreviewUrl}
                  alt="Your outfit"
                  className="max-h-64 w-full rounded-xl object-contain"
                />
                <p className="text-xs text-zinc-500">Click to change photo</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="text-4xl">{"\u{1F457}"}</div>
                <p className="text-sm font-medium text-zinc-300">
                  Drop your outfit photo here
                </p>
                <p className="text-xs text-zinc-500">or click to browse</p>
                <p className="mt-1 text-xs text-zinc-600">
                  JPG &middot; PNG &middot; WEBP &middot; Max 5MB
                </p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 mt-2">
            <p className="text-center text-sm text-zinc-400">
              💡 Best results: Full body photo in good lighting. Works best with
              casual, formal, and streetwear fits.
            </p>
          </div>

          {error ? (
            <p className="text-sm leading-relaxed text-red-400">{error}</p>
          ) : null}

          <select
            value={roastLanguage}
            onChange={(e) => setRoastLanguage(e.target.value as RoastLanguage)}
            disabled={loading}
            className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-zinc-300 outline-none focus:ring-1 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ROAST_LANGUAGE_OPTIONS.map((languageOption) => (
              <option key={languageOption} value={languageOption}>
                {languageOption}
              </option>
            ))}
          </select>

          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 mb-2">
            <span>🔒 100% Private</span>
            <span>•</span>
            <span>We never store your data</span>
            <span>•</span>
            <span>Instant results</span>
          </div>

          <button
            type="submit"
            disabled={loading || !imageBase64}
            className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4 text-center text-lg font-bold tracking-wide text-white shadow-lg shadow-orange-500/30 transition-[transform,filter,box-shadow] hover:from-orange-400 hover:to-red-500 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100 sm:py-4 sm:text-lg"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? "Analyzing..." : "🔍 Analyze My Outfit (Free)"}
            </span>
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full group-disabled:opacity-0"
            />
          </button>
        </form>

        {resultsVisible || hasPaid ? (
          <section
            className="mt-12 w-full max-w-md"
            aria-label="Results"
            aria-live="polite"
          >
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-5 shadow-xl shadow-black/40 backdrop-blur-sm sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Results
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    error
                      ? "bg-red-950/80 text-red-300/90"
                      : styleReport
                        ? "bg-sky-950/80 text-sky-300/90"
                        : roast
                          ? "bg-emerald-950/80 text-emerald-300/90"
                          : "bg-zinc-800/80 text-zinc-500"
                  }`}
                >
                  {error
                    ? "Error"
                    : styleReport
                      ? "Report ready"
                      : roast
                        ? "Roast ready"
                        : hasPaid
                          ? "Unlocked"
                          : "—"}
                </span>
              </div>

              {error ? (
                showRetryCountdown ? (
                  <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-zinc-950/70 to-orange-500/10 px-4 py-5 text-center shadow-[0_10px_30px_-18px_rgba(251,191,36,0.45)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/80">
                      AI queue is busy
                    </p>
                    <p className="mt-3 text-4xl font-bold tracking-tight text-white">
                      {retryCountdown}s
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                      High demand hit the free AI quota. Wait for the timer,
                      then try again for a much better shot.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-4 text-sm leading-relaxed text-red-200/90">
                    {error}
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  {roast ? (
                    <>
                      <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-5 sm:px-6 sm:py-6">
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(249,115,22,0.06),transparent_45%,rgba(244,63,94,0.05))]"
                        />
                        <p className="relative whitespace-pre-wrap text-pretty text-[15px] leading-[1.7] text-zinc-200 sm:text-base">
                          {roast}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopyRoast(roast)}
                          className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition-all hover:bg-zinc-800 sm:text-sm"
                        >
                          {copiedShare ? "✅ Copied!" : "📋 Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareOnWhatsApp(roast)}
                          className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition-all hover:bg-zinc-800 sm:text-sm"
                        >
                          📱 WhatsApp
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareOnX(roast)}
                          className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition-all hover:bg-zinc-800 sm:text-sm"
                        >
                          🐦 X
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareOnLinkedIn()}
                          className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition-all hover:bg-zinc-800 sm:text-sm"
                        >
                          💼 LinkedIn
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareOnThreads(roast)}
                          className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 transition-all hover:bg-zinc-800 sm:text-sm"
                        >
                          🧵 Threads
                        </button>
                        <button
                          type="button"
                          onClick={handleChallengeWhatsApp}
                          className="flex items-center gap-2 rounded-full border border-green-800 bg-green-950/50 px-3 py-2 text-xs text-green-300 transition-all hover:bg-green-900/50"
                        >
                          🎯 Challenge a Friend
                        </button>
                      </div>
                    </>
                  ) : null}

                  {hasPaid ? (
                    <div className="space-y-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-zinc-950/60 to-sky-500/10 p-5 sm:p-6">
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                          Payment Confirmed
                        </p>
                        <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                          Your Personal Style Playbook is Ready 🎨
                        </h3>
                        <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
                          See exactly what to wear, what to ditch, and how to dress for the life you want.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleGenerateReport()}
                        disabled={isGeneratingReport}
                        className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500 px-5 py-4 text-center text-sm font-semibold tracking-wide text-white shadow-[0_10px_35px_-12px_rgba(168,85,247,0.65)] transition-[transform,filter] hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
                      >
                        {isGeneratingReport
                          ? "Generating Style Report..."
                          : "\u2728 Generate My Style Report"}
                      </button>
                    </div>
                  ) : roast ? (
                    <>
                      {userCountry === null ? (
                        <button
                          type="button"
                          disabled
                          className="w-full rounded-xl border border-zinc-700/50 bg-zinc-950/50 px-5 py-4 text-center text-sm font-semibold tracking-wide text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] disabled:cursor-not-allowed sm:text-base"
                        >
                          Loading Secure Checkout...
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleCheckout()}
                          disabled={checkoutLoading}
                          className="w-full rounded-xl border border-amber-500/35 bg-gradient-to-b from-amber-500/15 to-transparent px-5 py-4 text-center text-sm font-semibold tracking-wide text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.12)_inset] transition-[border-color,background-color,transform] hover:border-amber-400/50 hover:from-amber-500/25 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
                        >
                          {checkoutLoading
                            ? "Redirecting to checkout..."
                            : userCountry === "IN"
                              ? "\u2728 Get My Personal Style Playbook \u2014 \u20B999"
                              : "\u2728 Get My Personal Style Playbook \u2014 $4.99"}
                        </button>
                      )}
                    </>
                  ) : hasPaid ? (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-4 text-sm leading-relaxed text-zinc-300">
                      Payment succeeded, but we could not restore the outfit
                      photo. Please re-upload your photo above to generate the
                      style report.
                    </div>
                  ) : null}

                  {styleReport ? (
                    <>
                      <div className="rounded-2xl border border-sky-500/20 bg-zinc-950/70 p-5 shadow-[0_12px_40px_-20px_rgba(56,189,248,0.55)] sm:p-6">
                        <div className="mb-4 flex items-center gap-3">
                          <div className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.8)]" />
                          <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-200/85">
                            Style Makeover Report
                          </h3>
                        </div>
                        <div className="whitespace-pre-wrap text-pretty text-sm leading-7 text-zinc-100 sm:text-[15px]">
                          {styleReport}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 text-center mt-4">
                        💡 Pro tip: Screenshot this report and save it before your next shopping trip. Your wardrobe ROI will thank you.
                      </p>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}

        <div className="mt-16 w-full max-w-md pb-12">
          <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Frequently Asked Questions
          </p>
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            {FIT_FAQS.map((faq, i) => (
              <div key={i} className="border-b border-zinc-800 last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    setOpenFaqIndex(openFaqIndex === i ? null : i)
                  }
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
                >
                  {faq.q}
                  <span
                    className={`shrink-0 text-zinc-600 transition-transform duration-200 ${openFaqIndex === i ? "rotate-180" : ""}`}
                  >
                    ▾
                  </span>
                </button>
                {openFaqIndex === i ? (
                  <p className="px-4 pb-4 text-sm leading-relaxed text-zinc-500">
                    {faq.a}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 w-full max-w-md pb-12">
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Real Results From Real People 🏆
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIT_TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="text-3xl mb-3">{t.emoji}</div>
                <div className="font-semibold text-zinc-300">{t.name}</div>
                <div className="text-sm text-zinc-500">{t.location} · {t.role}</div>
                <p className="text-sm leading-relaxed text-zinc-400 mt-2">{t.text}</p>
                {t.verified ? (
                  <div className="mt-3 text-xs text-emerald-400">✓ Verified</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
