"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserRole } from "@/lib/schema";

const ROLES: UserRole[] = [
  "PI", "SUB_INVESTIGATOR", "COORDINATOR", "DATA_MANAGER",
  "MONITOR", "PV_OFFICER", "EC_MEMBER", "DSMB_MEMBER",
  "REGULATORY", "SPONSOR", "ADMIN",
];

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("COORDINATOR");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        displayName: name,
        email: email,
        role: role,
        siteIds: [],
        trialIds: [],
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <form
        onSubmit={handleSignup}
        className="card"
        style={{ width: "100%", maxWidth: 420, padding: 28 }}
      >
        <div className="ui-brand" style={{ marginBottom: 6 }}>AIIA CTMS</div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Sign Up — DevRush CTMS</h1>
        <p className="muted" style={{ margin: "4px 0 20px", fontSize: 14 }}>
          Create an account for the prototype
        </p>

        <div className="field">
          <label className="field-label">Full name</label>
          <input
            className="input"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label className="field-label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
            required
          />
        </div>
        <div className="field">
          <label className="field-label">Role</label>
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {error && (
          <p
            style={{
              margin: "0 0 14px",
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

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>

        <p className="muted" style={{ marginTop: 18, marginBottom: 0, fontSize: 14 }}>
          Already have an account?{" "}
          <a href="/login" style={{ color: "var(--ui-brand)", fontWeight: 600, textDecoration: "underline" }}>
            Log in
          </a>
        </p>
      </form>
    </div>
  );
}
