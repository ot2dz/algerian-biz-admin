import { useState, type ReactNode } from "react";
import { Shield, Lock, LogIn } from "lucide-react";

const TOKEN_KEY = "admin_token";

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function AdminOnlyRoute({ children }: { children: ReactNode }) {
  const [token] = useState<string | null>(() => getStoredToken());
  const [checking, setChecking] = useState(!getStoredToken() ? false : true);
  const [valid, setValid] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claiming, setClaiming] = useState(false);

  if (token && checking) {
    fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setValid(data.is_admin);
        setChecking(false);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setChecking(false);
      });
  }

  const handleClaim = async () => {
    setClaimError("");
    setClaiming(true);
    try {
      const res = await fetch("/api/admin/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        setClaimError(err.error || "فشل التحقق");
        setClaiming(false);
        return;
      }
      const data = await res.json();
      setStoredToken(data.token);
      setValid(true);
    } catch {
      setClaimError("حدث خطأ في الاتصال");
    } finally {
      setClaiming(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin text-primary">
          <i className="fas fa-spinner text-4xl"></i>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-sm mx-auto p-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">لوحة التحكم</h1>
            <p className="text-slate-500">يرجى تسجيل الدخول للوصول إلى لوحة التحكم</p>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="اسم المستخدم"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleClaim()}
              className="w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {claimError && (
              <p className="text-sm text-red-500">{claimError}</p>
            )}
            <button
              onClick={handleClaim}
              disabled={claiming || !username || !password}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {claiming ? "جاري التحقق..." : "دخول"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
