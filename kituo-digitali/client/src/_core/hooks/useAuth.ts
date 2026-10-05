import { useCallback, useEffect, useMemo, useState } from "react";
import {
  authPersistenceReady,
  ensureAuthenticatedProfile,
  ensureUserProfile,
  firebaseAuth,
  onAuthStateChanged,
  saveFirebaseProfile,
  signOutFirebaseUser,
  subscribeToProfile,
  syncFirebaseAuthClaims,
  type FirebaseRoleClaims,
  type FirebaseProfile,
} from "@/lib/firebase";
import type { User } from "firebase/auth";

type UseAuthOptions = { redirectOnUnauthenticated?: boolean; redirectPath?: string };

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FirebaseProfile | null>(null);
  const [authClaims, setAuthClaims] = useState<FirebaseRoleClaims | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void authPersistenceReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
        if (!active) return;
        setFirebaseUser(nextUser);
        setProfile(null);
        setAuthClaims(null);
        setError(null);
        // Auth state is authoritative. A delayed or unavailable profile must
        // not make the user appear signed out or block navigation.
        setLoading(false);
        if (nextUser) {
          void ensureAuthenticatedProfile(nextUser).then(async () => {
            const nextClaims = await syncFirebaseAuthClaims();
            if (active) setAuthClaims(nextClaims);
          }).catch((cause) => {
            if (active) setError(cause);
          });
        }
      });
    }).catch((cause) => {
      if (active) { setError(cause); setLoading(false); }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    let active = true;
    const unsubscribe = subscribeToProfile(
      firebaseUser.uid,
      (nextProfile) => { if (active) setProfile(nextProfile); },
      (cause) => { if (active) setError(cause); },
    );
    return () => { active = false; unsubscribe(); };
  }, [firebaseUser]);

  const logout = useCallback(async () => {
    await signOutFirebaseUser();
  }, []);

  const user = useMemo(() => firebaseUser
    ? {
        ...(profile ?? {}),
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        name: profile?.name ?? firebaseUser.displayName ?? "Mwanachama",
        phone: profile?.phone ?? "",
        role: authClaims?.role ?? profile?.role ?? "user",
        permissions: authClaims?.permissions ?? profile?.permissions ?? {},
      } as FirebaseProfile & { id: string }
    : null, [firebaseUser, profile, authClaims]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || firebaseUser || typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;
    if (redirectPath) window.location.href = redirectPath;
  }, [redirectOnUnauthenticated, redirectPath, loading, firebaseUser]);

  return {
    user, firebaseUser, profile, loading, error,
    isAuthenticated: Boolean(firebaseUser),
    refresh: async () => { if (firebaseUser) await ensureUserProfile(firebaseUser); },
    updateProfile: async (values: Partial<FirebaseProfile>) => {
      if (firebaseUser) await saveFirebaseProfile(firebaseUser.uid, values);
    },
    logout,
  };
}
