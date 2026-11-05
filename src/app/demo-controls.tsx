"use client";

import Link from "next/link";
import { useState } from "react";

export function DemoControls() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");

  async function reset() {
    setState("busy");
    const res = await fetch("/api/demo/reset", { method: "POST" });
    setState(res.ok ? "done" : "failed");
  }

  return (
    <div className="mt-4 flex items-center gap-4 text-xs text-muted">
      <Link href="/operator" className="underline">
        Operator view
      </Link>
      <button type="button" onClick={reset} disabled={state === "busy"} className="underline">
        Reset demo data
      </button>
      {state === "done" && <span>Demo data reset.</span>}
      {state === "failed" && <span className="text-danger">Reset failed.</span>}
    </div>
  );
}
