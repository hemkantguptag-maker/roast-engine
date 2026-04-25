"use client";

import { FormEvent, useEffect, useState } from "react";

type SavedSession = {
  roast: string | null;
  rewrite: string | null;
  profileText: string;
};

const SESSION_STORAGE_KEY = "brutal-roast-rewrite-session";
const LINK_PASTE_ERROR =
  "🚨 SYSTEM ERROR: Did you seriously just paste a link? I am an AI, not a web scraper. Copy and paste your actual text like a normal professional. 0/10 for following instructions. Try again.";

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

export default function Home() {
  const [profileText, setProfileText] = useState("");
  const [loading, setLoading] = useState(false);
  const [roast, setRoast] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHasPaid(params.get("success") === "true");

    const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as SavedSession;
      setProfileText(parsed.profileText ?? "");
      setRoast(parsed.roast ?? null);
      setRewrite(parsed.rewrite ?? null);
      setResultsVisible(Boolean(parsed.roast || parsed.rewrite || parsed.profileText));
    } catch {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
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

  function persistSession(next: SavedSession) {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  }

  const showRetryCountdown = retryCountdown !== null && retryCountdown > 0;

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    void runRoast();
  }

  async function handleCheckout() {
    const variantId =
      userCountry === "IN"
        ? process.env.NEXT_PUBLIC_LEMON_SQUEEZY_INDIA_VARIANT_ID
        : process.env.NEXT_PUBLIC_LEMON_SQUEEZY_GLOBAL_VARIANT_ID;

    if (!variantId) {
      setError(
        `Missing variant ID for ${userCountry === "IN" ? "India" : "global"} checkout. Check your .env.local.`,
      );
      return;
    }

    persistSession({
      roast,
      rewrite,
      profileText,
    });

    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/checkout", {
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

  async function handleRewrite() {
    if (isRewriting) {
      return;
    }

    if (!profileText.trim()) {
      setError(
        "We could not restore the profile text after checkout. Roast the profile again, then try the rewrite.",
      );
      return;
    }

    setError(null);
    setIsRewriting(true);

    const nextUrl = new URL(window.location.href);
    if (nextUrl.searchParams.has("success")) {
      nextUrl.searchParams.delete("success");
      window.history.replaceState({}, "", nextUrl.toString());
    }

    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileText: profileText.trim(),
          country: userCountry,
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
        setError(message ?? "Could not generate your rewrite. Try again.");
        return;
      }

      const rewriteText =
        data &&
        typeof data === "object" &&
        "rewrite" in data &&
        typeof (data as { rewrite: unknown }).rewrite === "string"
          ? (data as { rewrite: string }).rewrite.trim()
          : null;

      if (!rewriteText) {
        setError("No rewrite in response.");
        return;
      }

      setRewrite(rewriteText);
      persistSession({
        roast,
        rewrite: rewriteText,
        profileText,
      });
    } catch {
      setError("Network error generating your rewrite. Try again.");
    } finally {
      setIsRewriting(false);
    }
  }

  async function runRoast() {
    const profileTextToSend = profileText.trim();

    if (/(http|https|www\.|linkedin\.com)/i.test(profileTextToSend)) {
      setError(LINK_PASTE_ERROR);
      return;
    }

    setError(null);
    setRoast(null);
    setRewrite(null);
    setLoading(true);

    try {
      const res = await fetch("/api/roast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileText: profileTextToSend,
          country: userCountry,
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
      persistSession({
        roast: roastText,
        rewrite: null,
        profileText: profileTextToSend,
      });
    } catch {
      setError("Network error. Check your connection and try again.");
      setResultsVisible(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-full flex flex-col overflow-hidden bg-zinc-950 text-zinc-100">
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
          <h1 className="bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl sm:leading-tight">
            Brutal Roast &amp; Rewrite
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
            Paste your LinkedIn profile text or resume. The AI will roast it for
            free. Pay $4.99 to have it rewritten into a Top-1% profile.
          </p>
        </header>

        <form
          className="w-full max-w-md space-y-5"
          method="post"
          onSubmit={handleFormSubmit}
        >
          <label htmlFor="profile-text" className="sr-only">
            LinkedIn profile text or resume
          </label>
          <textarea
            id="profile-text"
            rows={8}
            placeholder={`Copy & paste your raw text here (DO NOT paste links/URLs!)

What works best:
👉 Your LinkedIn 'About' section
👉 A few bullet points from your resume
👉 Your entire CV
👉 Your friend's (or boss's) profile just to roast them!`}
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            disabled={loading}
            required
            className="min-h-[200px] w-full resize-y rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-4 text-sm leading-7 text-zinc-100 shadow-inner shadow-black/40 outline-none ring-0 placeholder:text-zinc-600 backdrop-blur-sm transition-[border-color,box-shadow] focus:border-orange-500/60 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.15)] enabled:hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[220px] sm:text-base"
          />
          {error ? (
            <p className="text-sm leading-relaxed text-red-400">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500 px-6 py-4 text-center text-base font-bold tracking-wide text-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_12px_40px_-12px_rgba(249,115,22,0.55)] transition-[transform,filter] hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:brightness-100 sm:py-4 sm:text-lg"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span aria-hidden>{"\u{1F525}"}</span>
              {loading ? "Roasting..." : "Roast Me (Free)"}
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
                      : rewrite
                        ? "bg-sky-950/80 text-sky-300/90"
                        : roast
                          ? "bg-emerald-950/80 text-emerald-300/90"
                          : "bg-zinc-800/80 text-zinc-500"
                  }`}
                >
                  {error
                    ? "Error"
                    : rewrite
                      ? "Rewrite ready"
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
                      High demand hit the free AI quota. Wait for the timer, then
                      try again for a much better shot.
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
                    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-5 py-5 sm:px-6 sm:py-6">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(249,115,22,0.06),transparent_45%,rgba(244,63,94,0.05))]"
                      />
                      <p className="relative whitespace-pre-wrap text-pretty text-[15px] leading-[1.7] text-zinc-200 sm:text-base">
                        {roast}
                      </p>
                    </div>
                  ) : null}

                  {hasPaid ? (
                    <div className="space-y-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-zinc-950/60 to-sky-500/10 p-5 sm:p-6">
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                          Payment Confirmed
                        </p>
                        <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                          Your elite rewrite is unlocked
                        </h3>
                        <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
                          One click and we will turn this roasted profile into a recruiter-ready rewrite.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleRewrite()}
                        disabled={isRewriting}
                        className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500 px-5 py-4 text-center text-sm font-semibold tracking-wide text-white shadow-[0_10px_35px_-12px_rgba(168,85,247,0.65)] transition-[transform,filter] hover:brightness-110 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base"
                      >
                        {isRewriting
                          ? "Generating Masterpiece..."
                          : "\u2728 Generate My Elite Rewrite"}
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
                              ? "\u2728 Unlock Professional Rewrite \u2014 \u20B999"
                              : "\u2728 Unlock Professional Rewrite \u2014 $4.99"}
                        </button>
                      )}
                    </>
                  ) : hasPaid ? (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-4 text-sm leading-relaxed text-zinc-300">
                      Payment succeeded, but we could not restore the roast context. Roast the profile again to generate the rewrite.
                    </div>
                  ) : null}

                  {rewrite ? (
                    <div className="rounded-2xl border border-sky-500/20 bg-zinc-950/70 p-5 shadow-[0_12px_40px_-20px_rgba(56,189,248,0.55)] sm:p-6">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.8)]" />
                        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-200/85">
                          Elite Rewrite
                        </h3>
                      </div>
                      <div className="whitespace-pre-wrap text-pretty text-sm leading-7 text-zinc-100 sm:text-[15px]">
                        {rewrite}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
