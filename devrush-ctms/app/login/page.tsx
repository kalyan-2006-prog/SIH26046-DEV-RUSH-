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

  if (checking) {
    return (
      <div className="ui" style={{ display: "grid", placeItems: "center" }}>
        <p className="muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="ui" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <div className="ui-brand" style={{ marginBottom: 6 }}>AIIA CTMS</div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>AIIA CTMS Login</h1>
        <p className="muted" style={{ margin: "4px 0 20px", fontSize: 14 }}>
          Clinical trial and pharmacovigilance dashboard (prototype)
        </p>

        <div className="field">
          <label className="field-label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={handleLogin}
          disabled={submitting}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {submitting ? "Signing in..." : "Log In"}
        </button>

        {error && (
          <p
            style={{
              marginTop: 14,
              marginBottom: 0,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--ui-red-bg)",
              color: "var(--ui-red-text)",
              border: "1px solid var(--ui-red-border)",
              fontSize: 14,
            }}
          >
            {error}
          </p>
        )}

        <p className="muted" style={{ marginTop: 18, marginBottom: 0, fontSize: 14 }}>
          No account?{" "}
          <a href="/signup" style={{ color: "var(--ui-brand)", fontWeight: 600, textDecoration: "underline" }}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
