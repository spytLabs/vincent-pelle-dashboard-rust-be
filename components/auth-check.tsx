"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AuthCheck() {
  const router = useRouter();

  useEffect(() => {
    async function validateSession() {
      try {
        const res = await fetch("/api/auth/validate");
        if (!res.ok) {
          router.push("/login");
          router.refresh();
        }
      } catch {
        console.error("Failed to validate session");
      }
    }

    validateSession();
  }, [router]);

  return null;
}
