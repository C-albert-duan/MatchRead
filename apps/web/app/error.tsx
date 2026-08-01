"use client";

import Link from "next/link";
import { useEffect } from "react";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="stack gap-2xl" style={{ maxWidth: 520 }}>
      <div className="stack gap-lg">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="t-page-title">We hit a snag</h1>
        <p className="t-lead">
          Try again. If you were joining a league, open your invite link once
          more after signing in.
        </p>
      </div>
      <div className="row wrap gap-md">
        <button
          type="button"
          className="act act--standard act--standard-size"
          onClick={() => reset()}
        >
          Try again
        </button>
        <Link href="/" className="act act--quiet">
          Home
        </Link>
      </div>
    </div>
  );
}
