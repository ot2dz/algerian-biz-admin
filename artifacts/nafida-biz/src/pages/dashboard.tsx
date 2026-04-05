import { useAuth } from "@/hooks/useAuth";
import { PageLayout } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, AlertCircle, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGetProfile } from "@workspace/api-client-react";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: profile } = useGetProfile();
  const { toast } = useToast();

  const displayName = profile?.full_name || user?.email?.split('@')[0] || "مستخدم";

  const stats = [
    { label: "مجموع التصريحات", value: "12", icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "المبلغ المدفوع", value: "450,000 دج", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
    { label: "المبلغ المستحق", value: "125,000 دج", icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
    { label: "حالة النشاط", value: "نشط", icon: Briefcase, color: "text-primary", bg: "bg-primary/10" },
  ];

  return (
    <PageLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">مرحباً، {displayName}</h1>
            <p className="text-slate-500 mt-2">إليك نظرة عامة على وضعيتك الجبائية اليوم.</p>
          </div>
          <Button 
            className="bg-primary hover:bg-orange-600 text-white px-6 py-6 rounded-xl font-bold shadow-lg shadow-primary/20 flex items-center gap-2"
            onClick={() => toast({ title: "قريباً", description: "هذه الميزة قيد التطوير" })}
            data-testid="button-generate-pdf"
          >
            <i className="fas fa-file-pdf"></i>
            استخراج G50
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <Card key={i} className="border-0 shadow-xl shadow-slate-200/40 rounded-2xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`w-7 h-7 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 p-8 border border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6">النشاط الأخير</h2>
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
                {[
                  { date: "2024-03-15", type: "G50 - فيفري 2024", amount: "45,000 دج", status: "مدفوع", statusColor: "text-green-600 bg-green-50" },
                  { date: "2024-02-15", type: "G50 - جانفي 2024", amount: "42,500 دج", status: "مدفوع", statusColor: "text-green-600 bg-green-50" },
                  { date: "2024-04-15", type: "G50 - مارس 2024", amount: "50,000 دج", status: "قيد المعالجة", statusColor: "text-orange-600 bg-orange-50" },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4 text-slate-600">{row.date}</td>
                    <td className="py-4 px-4 font-medium text-slate-800">{row.type}</td>
                    <td className="py-4 px-4 text-slate-800">{row.amount}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${row.statusColor}`}>
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
