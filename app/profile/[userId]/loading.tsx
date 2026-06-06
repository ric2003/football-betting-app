import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] dark:bg-background">
      <Loader2 className="animate-spin text-[#16735f]" size={28} />
    </main>
  );
}
