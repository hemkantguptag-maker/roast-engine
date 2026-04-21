"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SavedSession = {
  roast: string | null;
  rewrite: string | null;
  profileText: string;
};

const SESSION_STORAGE_KEY = "brutal-roast-rewrite-session";

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

export default function SuccessPage() {
  const [profileText, setProfileText] = useState("");
  const [roast, setRoast] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [userCountry, setUserCountry] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as SavedSession;
      setProfileText(parsed.profileText ?? "");
      setRoast(parsed.roast ?? null);
      setRewrite(parsed.rewrite ?? null);
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
    setRetryCountdown(getRetrySeconds(error));
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

  async function handleRewrite() {
    if (isRewriting) {
      return;
    }

    if (!profileText.trim()) {
      setError(
        "Payment succeeded, but the saved profile text is missing. Return home and roast the profile again.",
      );
      return;
    }

    setError(null);
    setIsRewriting(true);

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

  const showRetryCountdown = retryCountdown !== null && retryCountdown > 0;

  return (
    <div className="relative min-h-full overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.2),transparent),radial-gradient(ellipse_60%_40%_at_100%_40%,rgba(59,130,246,0.08),transparent)]"
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
        <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Payment Confirmed
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Your elite rewrite is unlocked
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base">
              You made it through checkout. Generate the final polished version of
              your profile below.
            </p>
          </div>

          <div className="mt-8 space-y-6">
            {roast ? (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Saved Roast
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">
                  {roast}
                </p>
              </div>
            ) : null}

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
                    High demand hit the AI quota. Wait for the timer, then try again.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-4 text-sm leading-relaxed text-red-200/90">
                  {error}
                </div>
              )
            ) : null}

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

            {rewrite ? (
              <div className="rounded-2xl border border-sky-500/20 bg-zinc-950/70 p-5 shadow-[0_12px_40px_-20px_rgba(56,189,248,0.55)] sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.8)]" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-200/85">
                    Elite Rewrite
                  </h2>
                </div>
                <div className="whitespace-pre-wrap text-pretty text-sm leading-7 text-zinc-100 sm:text-[15px]">
                  {rewrite}
                </div>
              </div>
            ) : null}

            <div className="text-center">
              <Link
                href="/"
                className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
              >
                Return home
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
