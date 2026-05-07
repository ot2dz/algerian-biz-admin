import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

async function completePendingRegistration(email: string, token: string) {
  const key = `nafida_pending_reg_${email}`;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const { profile, company } = JSON.parse(raw) as {
      profile: Record<string, string>;
      company: Record<string, unknown>;
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // 1. Update profile (name + phone)
    await fetch("/api/profile", {
      method: "PUT",
      headers,
      body: JSON.stringify(profile),
    });

    // 2. Create company with all fields
    await fetch("/api/companies", {
      method: "POST",
      headers,
      body: JSON.stringify(company),
    });

    localStorage.removeItem(key);
  } catch {
    // Non-blocking: user can update info later from profile page
  }
}

export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();
  const handled = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (handled.current) return;

      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        handled.current = true;
        const email = session.user.email ?? "";
        if (email) {
          await completePendingRegistration(email, session.access_token);
        }
        setLocation("/");
      } else if (event === "SIGNED_OUT" || (!session && event !== "INITIAL_SESSION")) {
        handled.current = true;
        setLocation("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100">
          <i className="fas fa-spinner fa-spin text-orange-500 text-2xl" />
        </div>
        <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: "Tajawal, sans-serif" }}>
          جاري إعداد حسابك...
        </h2>
        <p className="text-slate-500" style={{ fontFamily: "Tajawal, sans-serif" }}>
          يرجى الانتظار، سيتم توجيهك تلقائياً
        </p>
      </div>
    </div>
  );
}
