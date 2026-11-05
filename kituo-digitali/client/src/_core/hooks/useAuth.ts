import { useCallback, useEffect, useMemo, useState } from "react";
import {
  authPersistenceReady,
  authPersistenceHasResolved,
  ensureAuthenticatedProfile,
  ensureUserProfile,
  getFirebaseProfileOnce,
  firebaseAuth,
  onAuthStateChanged,
  saveFirebaseProfile,
  signOutFirebaseUser,
  syncFirebaseAuthClaims,
  type FirebaseRoleClaims,
  type FirebaseProfile,
} from "@/lib/firebase";
import type { User } from "firebase/auth";

type UseAuthOptions = { redirectOnUnauthenticated?: boolean; redirectPath?: string };

// Share one Firebase auth observer across the app. Multiple page/header hooks
// must not independently race while a route is mounting or unmounting.
let sharedFirebaseUser: User | null = firebaseAuth.currentUser;
let sharedAuthReady = false;
let sharedAuthObserverStarted = false;
const sharedAuthSubscribers = new Set<(user: User | null) => void>();
function subscribeToSharedAuth(callback: (user: User | null) => void) {
  sharedAuthSubscribers.add(callback);
  callback(sharedFirebaseUser);
  if (!sharedAuthObserverStarted) {
    sharedAuthObserverStarted = true;
    void authPersistenceReady.then(() => {
      onAuthStateChanged(firebaseAuth, (nextUser) => {
        sharedFirebaseUser = nextUser;
        sharedAuthReady = true;
        sharedAuthSubscribers.forEach((subscriber) => subscriber(nextUser));
      });
    }).catch(() => {
      sharedAuthReady = true;
      sharedAuthSubscribers.forEach((subscriber) => subscriber(sharedFirebaseUser));
    });
  }
  return () => { sharedAuthSubscribers.delete(callback); };
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  // Reuse the already-restored Firebase user immediately when nested pages mount.
  // This prevents child service pages from briefly treating an active session as a guest.
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => firebaseAuth.currentUser);
  const [profile, setProfile] = useState<FirebaseProfile | null>(null);
  const [authClaims, setAuthClaims] = useState<FirebaseRoleClaims | null>(null);
  // Keep the session state available across route changes and component remounts.
  const [loading, setLoading] = useState(!sharedAuthReady);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    const receiveAuthState = (nextUser: User | null) => {
      if (!active) return;
      setFirebaseUser(nextUser);
      setProfile(null);
      setAuthClaims(null);
      setError(null);
      if (sharedAuthReady) setLoading(false);
      if (nextUser) {
        void ensureAuthenticatedProfile(nextUser).then(async () => {
          const nextClaims = await syncFirebaseAuthClaims();
          if (active) setAuthClaims(nextClaims);
        }).catch((cause) => {
          if (active) setError(cause);
        });
      }
    };
    const unsubscribe = subscribeToSharedAuth(receiveAuthState);
    if (sharedAuthReady) setLoading(false);
    return () => { active = false; unsubscribe(); };
  }, []);

  // Initialize/repair the Firestore profile before reading it. Previously the
  // profile read raced the registration/profile-creation request; accounts
  // whose document was created a moment later stayed on the "Mwanachama" fallback
  // until another sign-in. Serialize both operations and force a server read.
  useEffect(() => {
    if (!firebaseUser) return;
    let active = true;
    void (async () => {
      try {
        await ensureAuthenticatedProfile(firebaseUser);
        const nextProfile = await getFirebaseProfileOnce(firebaseUser.uid, { force: true });
        if (active) setProfile(nextProfile);
      } catch (cause) {
        if (active) setError(cause);
      }
    })();
    return () => { active = false; };
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
    refresh: async () => {
      if (!firebaseUser) return;
      await ensureUserProfile(firebaseUser);
      setProfile(await getFirebaseProfileOnce(firebaseUser.uid, { force: true }));
    },
    updateProfile: async (values: Partial<FirebaseProfile>) => {
      if (!firebaseUser) return;
      await saveFirebaseProfile(firebaseUser.uid, values);
      setProfile((current) => ({ ...(current ?? {}), ...values } as FirebaseProfile));
    },
    logout,
  };
}
