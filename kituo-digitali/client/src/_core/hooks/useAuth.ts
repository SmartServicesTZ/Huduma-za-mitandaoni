import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureUserProfile, authPersistenceReady, firebaseAuth, onAuthStateChanged, saveFirebaseProfile, signOut, subscribeToProfile, type FirebaseProfile } from "@/lib/firebase";
import type { User } from "firebase/auth";

type UseAuthOptions = { redirectOnUnauthenticated?: boolean; redirectPath?: string };

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FirebaseProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void authPersistenceReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(firebaseAuth, async (nextUser) => {
        if (!active) return;
        setLoading(true);
        setError(null);
        setFirebaseUser(nextUser);
        if (!nextUser) { setProfile(null); setLoading(false); return; }

        try {
          const cached = localStorage.getItem("firebase-user-profile");
          if (cached) {
            const parsed = JSON.parse(cached) as FirebaseProfile;
            if (parsed?.uid === nextUser.uid) setProfile(parsed);
          }
        } catch {
          localStorage.removeItem("firebase-user-profile");
        }

        try {
          await ensureUserProfile(nextUser, { emailVerified: nextUser.emailVerified });
        } catch (cause) {
          setError(cause);
        } finally {
          if (active) setLoading(false);
        }
      });
    }).catch((cause) => {
      if (active) { setError(cause); setLoading(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeToProfile(firebaseUser.uid, (nextProfile) => {
      setProfile(nextProfile);
      if (nextProfile) localStorage.setItem("firebase-user-profile", JSON.stringify(nextProfile));
    });
  }, [firebaseUser]);

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
    localStorage.removeItem("firebase-user-profile");
  }, []);

  const user = useMemo(() => firebaseUser ? { ...(profile ?? {}), id: firebaseUser.uid, uid: firebaseUser.uid, email: profile?.email ?? firebaseUser.email ?? "", name: profile?.name ?? firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "Mwanachama", phone: profile?.phone ?? "", role: profile?.role ?? "user" } as FirebaseProfile & { id: string } : null, [firebaseUser, profile]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || user || typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;
    if (redirectPath) window.location.href = redirectPath;
  }, [redirectOnUnauthenticated, redirectPath, loading, user]);

  return {
    user, firebaseUser, profile, loading, error,
    isAuthenticated: Boolean(firebaseUser),
    refresh: async () => { if (firebaseUser) await ensureUserProfile(firebaseUser); },
    updateProfile: async (values: Partial<FirebaseProfile>) => { if (firebaseUser) await saveFirebaseProfile(firebaseUser.uid, values); },
    logout,
  };
}
