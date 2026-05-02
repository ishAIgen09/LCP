// Persistent consumer session storage.
//
// The native consumer app keeps users signed in for the full 365-day
// life of their JWT (founder direction 2026-05-02). We stash the
// signed token + decoded ConsumerProfile in expo-secure-store so the
// session survives force-quits, OS reboots, and low-memory app evicts.
//
// expo-secure-store on iOS is backed by the Keychain; on Android it
// uses Keystore-encrypted SharedPreferences. Web is unsupported in
// this module — every helper short-circuits to a no-op there so
// `expo start --web` doesn't crash, but web is not the production
// target and we don't try to implement a localStorage fallback.

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import type { Session } from "./theme";

const SESSION_KEY = "lcp.consumer.session.v1";

const isNativePlatform = Platform.OS === "ios" || Platform.OS === "android";

export async function loadSession(): Promise<Session | null> {
  if (!isNativePlatform) return null;
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    // Defensive shape check — if the stored payload is malformed (e.g.
    // a partial write from a crashed earlier version), drop it rather
    // than feeding broken data into the rest of the app.
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      !parsed.consumer ||
      typeof parsed.consumer.consumer_id !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    // Keychain failure (very rare). Treat as "no stored session" so
    // the app falls back to the login screen instead of crashing.
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  if (!isNativePlatform) return;
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Best-effort: a write failure means the user will have to sign in
    // again next launch, which is the same UX as before this change.
  }
}

export async function clearSession(): Promise<void> {
  if (!isNativePlatform) return;
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // No-op: even on failure the in-memory state is already cleared.
  }
}
