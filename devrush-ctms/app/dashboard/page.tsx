"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { CTMSUser } from "@/lib/schema";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CTMSUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (snap.exists()) {
        setUser(snap.data() as CTMSUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (!user) return null;

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Welcome, {user.displayName}</h1>
      <p>Role: {user.role}</p>
      <p>This is the {user.role} dashboard — role-specific content goes here.</p>
    </div>
  );
}