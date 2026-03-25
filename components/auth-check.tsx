"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";

export function AuthCheck() {
  const router = useRouter();

  useEffect(() => {
    async function validateSession() {
      try {
        const cookie = localStorage.getItem("koombiyo_session");
        if (!cookie) {
          router.push("/login");
          return;
        }
        const isValid = await invoke<boolean>("validate_koombiyo", { cookie });
        if (!isValid) {
          localStorage.removeItem("koombiyo_session");
          router.push("/login");
        }
      } catch {
        console.error("Failed to validate session");
        router.push("/login");
      }
    }

    validateSession();
  }, [router]);

  return null;
}
