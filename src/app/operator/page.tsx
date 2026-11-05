import type { Metadata } from "next";
import { OperatorScreen } from "./operator-screen";

export const metadata: Metadata = { title: "Recourse operator" };

export default function OperatorPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <OperatorScreen />
    </main>
  );
}
