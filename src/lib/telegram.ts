import { UserAccountProfile } from "../types";

const SIMULATED_PROFILES: UserAccountProfile[] = [
  {
    id: "usr_seth_19",
    name: "Seth Mantey",
    username: "@sethmantey19",
    isTelegram: false,
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
  },
  {
    id: "usr_alex_bot",
    name: "Alex Trader",
    username: "@alextrader_pro",
    isTelegram: false,
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
  },
  {
    id: "usr_deriv_vip",
    name: "Deriv VIP Member",
    username: "@deriv_scalper",
    isTelegram: false,
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80"
  }
];

const STORAGE_KEY = "active_tma_user_profile";

export function initTelegramWebApp(): UserAccountProfile {
  const twa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

  if (twa && twa.initDataUnsafe?.user) {
    // Running inside actual Telegram Mini App container!
    try {
      twa.ready();
      twa.expand();
      if (twa.setHeaderColor) twa.setHeaderColor("#0f172a");
      if (twa.setBackgroundColor) twa.setBackgroundColor("#0f172a");
    } catch (e) {
      console.warn("Telegram WebApp API styling error:", e);
    }

    const u = twa.initDataUnsafe.user;
    const profile: UserAccountProfile = {
      id: `tg_${u.id}`,
      name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Telegram User",
      username: u.username ? `@${u.username}` : `@user_${u.id}`,
      avatarUrl: u.photo_url,
      isTelegram: true
    };
    
    // Save to local storage for quick access
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  // If outside Telegram (e.g. desktop web preview in Google AI Studio), load saved simulated profile or default
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as UserAccountProfile;
      return parsed;
    } catch (e) {}
  }

  // Default to first profile
  const defaultProfile = SIMULATED_PROFILES[0];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProfile));
  return defaultProfile;
}

export function getSimulatedProfiles(): UserAccountProfile[] {
  return SIMULATED_PROFILES;
}

export function switchActiveProfile(profile: UserAccountProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function triggerHaptic(style: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'error' = 'medium') {
  const twa = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  if (!twa || !twa.HapticFeedback) return;

  try {
    if (style === 'selection') {
      twa.HapticFeedback.selectionChanged();
    } else if (style === 'success') {
      twa.HapticFeedback.notificationOccurred('success');
    } else if (style === 'error') {
      twa.HapticFeedback.notificationOccurred('error');
    } else {
      twa.HapticFeedback.impactOccurred(style as any);
    }
  } catch (e) {
    // Ignore haptic errors on unsupported devices
  }
}
