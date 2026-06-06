"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignOutPage() {
  const { signOut } = useAuthActions();
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    async function endSession() {
      await signOut();
      if (isActive) {
        router.replace("/signin");
      }
    }

    void endSession();

    return () => {
      isActive = false;
    };
  }, [router, signOut]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7f2] px-4 text-[#18201b] transition-colors dark:bg-background dark:text-foreground">
      <div className="flex items-center gap-3 rounded-lg border border-[#d7ded3] bg-white px-4 py-3 text-sm font-semibold shadow-sm dark:border-border dark:bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-[#16735f] dark:text-primary" />
        A terminar sessao...
      </div>
    </main>
  );
}
