import type { Metadata } from "next";
import { TestConsole } from "./test-console";

export const metadata: Metadata = { title: "Recourse test page" };

export default function TestPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">PayPal sandbox test page</h1>
      <p className="mt-2 text-sm opacity-70">
        Sandbox only: no real money moves. The agent charge is simulated by our own code using
        merchant credentials.
      </p>
      <TestConsole />
    </main>
  );
}
