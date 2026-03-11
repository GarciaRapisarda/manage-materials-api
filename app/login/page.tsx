"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm/LoginForm";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (getStoredToken()) {
      router.replace("/");
    }
  }, [router]);

  return (
    <main className={styles.main}>
      <LoginForm />
    </main>
  );
}
