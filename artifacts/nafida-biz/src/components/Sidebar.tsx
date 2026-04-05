import { Link, useLocation } from "wouter";
import { LayoutDashboard, UserCircle, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function Sidebar() {
  const [location] = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { href: "/", label: "لوحة القيادة", icon: LayoutDashboard },
    { href: "/profile", label: "الملف الشخصي", icon: UserCircle },
  ];

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen fixed right-0 border-l border-sidebar-border">
      <div className="p-6 flex items-center gap-3 font-bold text-2xl border-b border-sidebar-border/20">
        <i className="fas fa-window-restore text-primary"></i>
        <span>نافذة بيز</span>
      </div>
      <div className="flex-1 py-6 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground/80 hover:text-sidebar-foreground"
                }`}
                data-testid={`link-sidebar-${item.href.replace("/", "") || "home"}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-sidebar-border/20">
        <button
          onClick={handleLogout}
          data-testid="button-logout"
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl hover:bg-destructive/20 text-destructive transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}

export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex pr-64">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
