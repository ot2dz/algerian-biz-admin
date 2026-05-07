import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, UserCircle, LogOut, Building2, ChevronDown, Check, ReceiptText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyContext";

export function Sidebar() {
  const [location] = useLocation();
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const { companies, selectedCompany, setSelectedCompany } = useCompany();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { href: "/", label: "لوحة القيادة", icon: LayoutDashboard },
    { href: "/taxes", label: "الضرائب", icon: ReceiptText },
    { href: "/profile", label: "الملف الشخصي", icon: UserCircle },
  ];

  const multiCompany = companies.length > 1;

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen fixed right-0 border-l border-sidebar-border">
      <div className="p-6 flex items-center gap-3 font-bold text-2xl border-b border-sidebar-border/20">
        <i className="fas fa-window-restore text-primary" />
        <span>نافذة بيز</span>
      </div>

      {/* Company display */}
      <div className="px-4 pt-4 pb-2 relative">
        {multiCompany ? (
          <>
            <button
              onClick={() => setCompanyDropdownOpen(!companyDropdownOpen)}
              className="w-full flex items-center justify-between gap-2 bg-sidebar-accent/40 hover:bg-sidebar-accent/60 px-4 py-3 rounded-xl transition-all border border-sidebar-border/20"
              data-testid="button-company-selector"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold truncate text-sidebar-foreground">
                  {selectedCompany?.company_name || "اختر نشاطاً"}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-sidebar-foreground/60 flex-shrink-0 transition-transform ${companyDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {companyDropdownOpen && (
              <div className="absolute top-full right-4 left-4 mt-1 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 overflow-hidden">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => { setSelectedCompany(company); setCompanyDropdownOpen(false); }}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-orange-50 transition-colors text-right"
                    data-testid={`button-select-company-${company.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{company.company_name}</p>
                        {company.tax_regime && (
                          <p className="text-xs text-slate-400">{company.tax_regime}</p>
                        )}
                      </div>
                    </div>
                    {selectedCompany?.id === company.id && (
                      <Check className="w-4 h-4 text-orange-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 bg-sidebar-accent/40 px-4 py-3 rounded-xl border border-sidebar-border/20">
            <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate text-sidebar-foreground">
                {selectedCompany?.company_name || "لا يوجد نشاط"}
              </p>
              {selectedCompany?.tax_regime && (
                <p className="text-xs text-sidebar-foreground/50 truncate">{selectedCompany.tax_regime}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 py-4 px-4 space-y-2">
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
    <div className="min-h-screen bg-background flex pr-64" dir="rtl">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
