import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setLocation("/");
      } else if (event === "SIGNED_OUT" || !session) {
        setLocation("/login");
      }
    });
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100">
          <i className="fas fa-spinner fa-spin text-orange-500 text-2xl"></i>
        </div>
        <h2 className="text-xl font-bold text-slate-800" style={{ fontFamily: 'Tajawal, sans-serif' }}>
          جاري التحقق من حسابك...
        </h2>
        <p className="text-slate-500" style={{ fontFamily: 'Tajawal, sans-serif' }}>
          يرجى الانتظار، سيتم توجيهك تلقائياً
        </p>
      </div>
    </div>
  );
}
