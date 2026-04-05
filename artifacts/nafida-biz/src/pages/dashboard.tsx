import { useAuth } from "@/hooks/useAuth";
import { PageLayout } from "@/components/Sidebar";
import { NotificationBanner } from "@/components/NotificationBanner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, AlertCircle, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGetProfile } from "@workspace/api-client-react";
import { useCompany } from "@/context/CompanyContext";

const IFU_ACTIVITIES = [
  {
    date: "2024-03-31",
    type: "قسط IFU - الثلاثي الأول",
    amount: "45,000 دج",
    status: "مدفوع",
    statusColor: "text-green-600 bg-green-50",
  },
  {
    date: "2024-06-30",
    type: "قسط IFU - الثلاثي الثاني",
    amount: "45,000 دج",
    status: "مدفوع",
    statusColor: "text-green-600 bg-green-50",
  },
  {
    date: "2024-09-30",
    type: "قسط IFU - الثلاثي الثالث",
    amount: "45,000 دج",
    status: "قيد المعالجة",
    statusColor: "text-orange-600 bg-orange-50",
  },
];

const G50_ACTIVITIES = [
  {
    date: "2024-03-15",
    type: "G50 - فيفري 2024",
    amount: "45,000 دج",
    status: "مدفوع",
    statusColor: "text-green-600 bg-green-50",
  },
  {
    date: "2024-02-15",
    type: "G50 - جانفي 2024",
    amount: "42,500 دج",
    status: "مدفوع",
    statusColor: "text-green-600 bg-green-50",
  },
  {
    date: "2024-04-15",
    type: "G50 - مارس 2024",
    amount: "50,000 دج",
    status: "قيد المعالجة",
    statusColor: "text-orange-600 bg-orange-50",
  },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: profile } = useGetProfile();
  const { selectedCompany } = useCompany();
  const { toast } = useToast();

  const isIFU = selectedCompany?.tax_regime === "IFU";

  const displayName =
    profile?.first_name
      ? `${profile.first_name} ${profile.last_name || ""}`.trim()
      : profile?.full_name || user?.email?.split("@")[0] || "مستخدم";

  const companyDisplay = selectedCompany?.company_name || "لا توجد شركة مختارة";

  const regimeBadgeLabel =
    selectedCompany?.tax_regime
      ? selectedCompany.tax_regime === "IFU"
        ? "IFU - الضريبة الجزافية الوحيدة"
        : selectedCompany.tax_regime === "Real"
        ? "نظام حقيقي"
        : "RSI - نظام مبسط"
      : null;

  const stats = [
    {
      label: isIFU ? "الأقساط الثلاثية" : "مجموع التصريحات",
      value: isIFU ? "3" : "12",
      icon: FileText,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "المبلغ المدفوع",
      value: "450,000 دج",
      icon: CheckCircle2,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "المبلغ المستحق",
      value: "125,000 دج",
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
    },
    {
      label: "حالة النشاط",
      value: "نشط",
      icon: Briefcase,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  const activities = isIFU ? IFU_ACTIVITIES : G50_ACTIVITIES;

  return (
    <PageLayout>
      <NotificationBanner />
      <div className="space-y-8 max-w-6xl mx-auto p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800" data-testid="text-welcome">
              مرحباً، {displayName}
            </h1>
            <p className="text-slate-500 mt-1 text-sm font-medium" data-testid="text-company-name">
              <i className="fas fa-building ml-1 text-primary"></i>
              {companyDisplay}
            </p>
            {regimeBadgeLabel && (
              <span
                className={`inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isIFU
                    ? "bg-blue-50 text-blue-600"
                    : "bg-orange-50 text-orange-600"
                }`}
                data-testid="badge-tax-regime"
              >
                {regimeBadgeLabel}
              </span>
            )}
            <p className="text-slate-400 mt-1 text-xs">إليك نظرة عامة على وضعيتك الجبائية اليوم.</p>
          </div>

          <Button
            className={`text-white px-6 py-6 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-colors ${
              isIFU
                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
                : "bg-primary hover:bg-orange-600 shadow-primary/20"
            }`}
            onClick={() =>
              toast({
                title: "قريباً",
                description: `استخراج ${isIFU ? "G12" : "G50"} قيد التطوير`,
              })
            }
            data-testid="button-generate-pdf"
          >
            <i className="fas fa-file-pdf"></i>
            {isIFU ? "استخراج G12" : "استخراج G50"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <Card
              key={`${selectedCompany?.id ?? "none"}-${i}`}
              className="border-0 shadow-xl shadow-slate-200/40 rounded-2xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-7 h-7 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                  <p
                    className="text-2xl font-bold text-slate-800 mt-1"
                    data-testid={`stat-value-${i}`}
                  >
                    {stat.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 p-8 border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800">النشاط الأخير</h2>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full ${
                isIFU ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
              }`}
            >
              {isIFU ? "أقساط IFU" : "تصريحات G50"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 text-slate-500 font-medium px-4">التاريخ</th>
                  <th className="pb-4 text-slate-500 font-medium px-4">نوع التصريح</th>
                  <th className="pb-4 text-slate-500 font-medium px-4">المبلغ</th>
                  <th className="pb-4 text-slate-500 font-medium px-4">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-4 px-4 text-slate-600">{row.date}</td>
                    <td className="py-4 px-4 font-medium text-slate-800">{row.type}</td>
                    <td className="py-4 px-4 text-slate-800">{row.amount}</td>
                    <td className="py-4 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${row.statusColor}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
