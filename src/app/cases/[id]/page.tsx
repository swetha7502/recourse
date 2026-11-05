import { Suspense } from "react";
import { CaseScreen } from "./case-screen";

async function LoadedCase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseScreen id={id} />;
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<p className="text-muted">Loading case...</p>}>
        <LoadedCase params={params} />
      </Suspense>
    </main>
  );
}
