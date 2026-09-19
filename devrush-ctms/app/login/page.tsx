"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        router.replace("/dashboard");
      } else {
        setChecking(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    setError("");
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/dashboard");
    } catch (err) {
      console.error("Login failed:", err);
      setError("Login failed. Check your email and password.");
      setSubmitting(false);
    }
  };

  if (checking) return <div style={{ padding: "2rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "2rem", maxWidth: "400px" }}>
      <h1>AIIA CTMS Login</h1>
      <div style={{ marginTop: "1rem" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem", color: "#000" }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLogin();
          }}
          style={{ display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem", color: "#000" }}
        />
        <button
          onClick={handleLogin}
          disabled={submitting}
          style={{ padding: "0.5rem 1.25rem", cursor: "pointer" }}
        >
          {submitting ? "Signing in..." : "Log In"}
        </button>
        {error && <p style={{ color: "#c0392b", marginTop: "0.75rem" }}>{error}</p>}
        <p style={{ marginTop: "1rem" }}>
          No account? <a href="/signup" style={{ textDecoration: "underline" }}>Sign up</a>
        </p>
      </div>
    </div>
  );
}