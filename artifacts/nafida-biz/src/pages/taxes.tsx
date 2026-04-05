import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { PageLayout } from "@/components/Sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/context/CompanyContext";
import {
  useListDeclarations,
  useCreateDeclaration,
  useUpdateDeclarationStatus,
  getListDeclarationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, Plus, Download, CheckCircle2, Clock, ChevronLeft, ChevronRight, Calculator, Eye } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("fr-DZ") + " دج";
}

function currentDeadline(taxType: string): { label: string; date: string; daysLeft: number; urgent: boolean } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (taxType === "G12") {
    const quarters = [
      { label: "الثلاثي الأول", month: 2, day: 20 },
      { label: "الثلاثي الثاني", month: 5, day: 20 },
      { label: "الثلاثي الثالث", month: 8, day: 20 },
      { label: "الثلاثي الرابع", month: 11, day: 20 },
    ];
    const next = quarters.find(q => q.month > month) ?? { ...quarters[0], month: quarters[0].month + 12 };
    const deadline = new Date(year, next.month, next.day);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
    return { label: `قسط IFU - ${next.label}`, date: deadline.toLocaleDateString("fr-DZ"), daysLeft, urgent: daysLeft <= 5 };
  }

  const deadlineDay = 20;
  let deadlineMonth = month;
  if (now.getDate() > deadlineDay) deadlineMonth = month + 1;
  const deadline = new Date(year, deadlineMonth, deadlineDay);
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  const monthName = deadline.toLocaleString("ar-DZ", { month: "long" });
  return { label: `G50 - ${monthName} ${year}`, date: deadline.toLocaleDateString("fr-DZ"), daysLeft, urgent: daysLeft <= 5 };
}

// ─── IFU wizard form ────────────────────────────────────────────────────────

const ifuStep1Schema = z.object({
  period: z.string().min(4, "حدد الفترة"),
  revenue: z.string().min(1, "أدخل رقم الأعمال"),
  activity_type: z.enum(["commerce", "services"], { required_error: "حدد نوع النشاط" }),
});

// ─── G50 wizard form ────────────────────────────────────────────────────────

const g50Step1Schema = z.object({
  period: z.string().min(4, "حدد الفترة"),
  revenue: z.string().min(1, "أدخل رقم المبيعات"),
  purchases: z.string().optional(),
  salaries: z.string().optional(),
});

// ─── Tax Wizard ─────────────────────────────────────────────────────────────

function TaxWizard({ open, onClose, isIFU, companyId }: {
  open: boolean; onClose: () => void; isIFU: boolean; companyId: string;
}) {
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const createDeclaration = useCreateDeclaration();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const ifuForm = useForm({ resolver: zodResolver(ifuStep1Schema), defaultValues: { period: "", revenue: "", activity_type: "commerce" as const } });
  const g50Form = useForm({ resolver: zodResolver(g50Step1Schema), defaultValues: { period: "", revenue: "", purchases: "", salaries: "" } });

  const handleReset = () => { setStep(1); setPreview(null); ifuForm.reset(); g50Form.reset(); };
  const handleClose = () => { handleReset(); onClose(); };

  // IFU calculation
  const calcIFU = ifuForm.handleSubmit((vals) => {
    const rev = parseFloat(vals.revenue.replace(/\s/g, ""));
    if (isNaN(rev)) return;
    const rate = vals.activity_type === "services" ? 0.05 : 0.005;
    setPreview({ revenue: rev, rate, tax: Math.round(rev * rate) });
    setStep(2);
  });

  // G50 calculation
  const calcG50 = g50Form.handleSubmit((vals) => {
    const rev = parseFloat(vals.revenue.replace(/\s/g, "")) || 0;
    const purch = parseFloat((vals.purchases || "0").replace(/\s/g, "")) || 0;
    const sal = parseFloat((vals.salaries || "0").replace(/\s/g, "")) || 0;
    const tap = Math.round(rev * 0.02);
    const tva = Math.round((rev - purch) * 0.19);
    const irg = Math.round(sal * 0.10);
    setPreview({ revenue: rev, purchases: purch, salaries: sal, tap, tva, irg, total: tap + tva + irg });
    setStep(2);
  });

  const handleConfirm = async () => {
    if (!preview) return;
    try {
      const baseVals = isIFU ? ifuForm.getValues() : g50Form.getValues();
      await createDeclaration.mutateAsync({
        data: {
          company_id: companyId,
          period: baseVals.period,
          tax_type: isIFU ? "G12" : "G50",
          revenue: String(preview.revenue),
          tax_rate: isIFU ? String(preview.rate) : undefined,
          tax_amount: isIFU ? String(preview.tax) : undefined,
          tap_amount: !isIFU ? String(preview.tap) : undefined,
          tva_amount: !isIFU ? String(preview.tva) : undefined,
          irg_amount: !isIFU ? String(preview.irg) : undefined,
          purchases: !isIFU ? String(preview.purchases) : undefined,
          salaries: !isIFU ? String(preview.salaries) : undefined,
          status: "pending",
        },
      });
      queryClient.invalidateQueries({ queryKey: getListDeclarationsQueryKey({ company_id: companyId }) });
      toast({ title: "تم الحفظ", description: "تم تسجيل التصريح بنجاح" });
      handleClose();
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "فشل في حفظ التصريح" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden" dir="rtl">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">
              معالج التصريح الجديد
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-4">
            {["إدخال البيانات", "الحساب الآلي", "التأكيد"].map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${step > i + 1 ? "bg-orange-500 border-orange-500 text-white" : step === i + 1 ? "border-orange-400 text-orange-400" : "border-slate-600 text-slate-500"}`}>
                  {step > i + 1 ? "✓" : i + 1}
                </div>
                <span className={`text-xs hidden sm:block ${step >= i + 1 ? "text-orange-400" : "text-slate-500"}`}>{label}</span>
                {i < 2 && <div className="flex-1 h-px bg-slate-700 mx-1"></div>}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Step 1 IFU */}
          {step === 1 && isIFU && (
            <Form {...ifuForm}>
              <form onSubmit={calcIFU} className="space-y-4">
                <FormField control={ifuForm.control} name="period" render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفترة (الثلاثي)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="مثال: 2024-Q1" className="rounded-xl" data-testid="input-period" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={ifuForm.control} name="revenue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الأعمال الثلاثي (دج)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="2 500 000" className="rounded-xl text-left font-mono" dir="ltr" data-testid="input-revenue" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={ifuForm.control} name="activity_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع النشاط</FormLabel>
                    <FormControl>
                      <div className="flex gap-3">
                        {[{ val: "commerce", label: "تجاري (0.5%)" }, { val: "services", label: "خدماتي (5%)" }].map(opt => (
                          <button key={opt.val} type="button"
                            onClick={() => field.onChange(opt.val)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${field.value === opt.val ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200 text-slate-600 hover:border-orange-300"}`}
                            data-testid={`btn-activity-${opt.val}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-5 font-bold flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> حساب الضريبة
                </Button>
              </form>
            </Form>
          )}

          {/* Step 1 G50 */}
          {step === 1 && !isIFU && (
            <Form {...g50Form}>
              <form onSubmit={calcG50} className="space-y-4">
                <FormField control={g50Form.control} name="period" render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفترة (الشهر)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="مثال: 2024-03" className="rounded-xl" data-testid="input-period" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={g50Form.control} name="revenue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الأعمال الشهري (دج)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="850 000" className="rounded-xl text-left font-mono" dir="ltr" data-testid="input-revenue" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={g50Form.control} name="purchases" render={({ field }) => (
                    <FormItem>
                      <FormLabel>المشتريات (دج)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="200 000" className="rounded-xl text-left font-mono" dir="ltr" data-testid="input-purchases" />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={g50Form.control} name="salaries" render={({ field }) => (
                    <FormItem>
                      <FormLabel>الأجور (دج)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="150 000" className="rounded-xl text-left font-mono" dir="ltr" data-testid="input-salaries" />
                      </FormControl>
                    </FormItem>
                  )} />
                </div>
                <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-5 font-bold flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> حساب G50
                </Button>
              </form>
            </Form>
          )}

          {/* Step 2 – Preview */}
          {step === 2 && preview && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-orange-500" /> معاينة الحساب
                </h3>
                <div className="divide-y divide-slate-100">
                  <div className="flex justify-between py-2.5 text-sm">
                    <span className="text-slate-500">رقم الأعمال</span>
                    <span className="font-mono font-semibold">{fmt(preview.revenue)}</span>
                  </div>
                  {isIFU && (
                    <>
                      <div className="flex justify-between py-2.5 text-sm">
                        <span className="text-slate-500">نسبة الضريبة</span>
                        <span className="font-mono font-semibold">{(preview.rate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between py-2.5 text-sm font-bold text-orange-600">
                        <span>مبلغ IFU المستحق</span>
                        <span className="font-mono">{fmt(preview.tax)}</span>
                      </div>
                    </>
                  )}
                  {!isIFU && (
                    <>
                      <div className="flex justify-between py-2.5 text-sm">
                        <span className="text-slate-500">TAP (2%)</span>
                        <span className="font-mono font-semibold">{fmt(preview.tap)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 text-sm">
                        <span className="text-slate-500">TVA (19%)</span>
                        <span className="font-mono font-semibold">{fmt(preview.tva)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 text-sm">
                        <span className="text-slate-500">IRG (10%)</span>
                        <span className="font-mono font-semibold">{fmt(preview.irg)}</span>
                      </div>
                      <div className="flex justify-between py-2.5 text-base font-bold text-orange-600 bg-orange-50 rounded-xl px-3 mt-1">
                        <span>المجموع المستحق</span>
                        <span className="font-mono">{fmt(preview.total)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-xl" data-testid="btn-wizard-back">
                  <ChevronRight className="w-4 h-4 ml-1" /> تعديل
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={createDeclaration.isPending}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold"
                  data-testid="btn-wizard-confirm"
                >
                  {createDeclaration.isPending ? <i className="fas fa-spinner fa-spin"></i> : "حفظ التصريح"}
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Taxes Page ─────────────────────────────────────────────────────────

export default function TaxesPage() {
  const { selectedCompany } = useCompany();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useUpdateDeclarationStatus();

  const isIFU = selectedCompany?.tax_regime === "IFU";
  const companyId = selectedCompany?.id ?? "";

  const { data: declarations = [], isLoading } = useListDeclarations(
    { company_id: companyId },
    { query: { enabled: !!companyId } }
  );

  const filtered = useMemo(() => {
    if (statusFilter === "all") return declarations;
    return declarations.filter(d => d.status === statusFilter);
  }, [declarations, statusFilter]);

  const deadline = companyId ? currentDeadline(isIFU ? "G12" : "G50") : null;

  const handleMarkPaid = (id: string) => {
    updateStatus.mutate({ id, data: { status: "paid" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDeclarationsQueryKey({ company_id: companyId }) });
        toast({ title: "تم التحديث", description: "تم تسجيل الدفع بنجاح" });
      },
    });
  };

  return (
    <PageLayout>
      <div className="space-y-8 max-w-6xl mx-auto p-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">إدارة الضرائب</h1>
            <p className="text-slate-500 mt-1 text-sm">
              {selectedCompany?.company_name || "اختر شركة"} ·{" "}
              <span className={`font-semibold ${isIFU ? "text-blue-600" : "text-orange-600"}`}>
                {isIFU ? "نظام IFU" : selectedCompany?.tax_regime === "Real" ? "نظام حقيقي" : "نظام مبسط"}
              </span>
            </p>
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            disabled={!companyId}
            className={`text-white px-6 py-5 rounded-xl font-bold shadow-lg flex items-center gap-2 ${isIFU ? "bg-blue-600 hover:bg-blue-700" : "bg-primary hover:bg-orange-600"}`}
            data-testid="btn-new-declaration"
          >
            <Plus className="w-4 h-4" />
            تصريح جديد
          </Button>
        </div>

        {/* Top Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Deadline Tracker */}
          {deadline && (
            <Card className={`border-0 shadow-xl rounded-2xl col-span-1 md:col-span-2 ${deadline.urgent ? "bg-red-50" : "bg-white"} shadow-slate-200/40`}>
              <CardContent className="p-6 flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${deadline.urgent ? "bg-red-100" : isIFU ? "bg-blue-100" : "bg-orange-100"}`}>
                  <CalendarClock className={`w-7 h-7 ${deadline.urgent ? "text-red-500" : isIFU ? "text-blue-600" : "text-primary"}`} />
                </div>
                <div className="flex-1">
                  <p className="text-slate-500 text-sm font-medium">الموعد القادم</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{deadline.label}</p>
                  <p className="text-sm text-slate-500 mt-0.5">آخر أجل: <span className="font-mono font-semibold">{deadline.date}</span></p>
                </div>
                <div className={`text-center px-4 py-3 rounded-2xl flex-shrink-0 ${deadline.urgent ? "bg-red-100" : isIFU ? "bg-blue-100" : "bg-orange-100"}`}>
                  <p className={`text-3xl font-black ${deadline.urgent ? "text-red-600" : isIFU ? "text-blue-600" : "text-primary"}`}>{deadline.daysLeft}</p>
                  <p className="text-xs text-slate-500 font-medium">يوم متبقي</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats card */}
          <Card className="border-0 shadow-xl shadow-slate-200/40 rounded-2xl bg-white">
            <CardContent className="p-6">
              <p className="text-slate-500 text-sm font-medium">التصريحات المسجلة</p>
              <p className="text-4xl font-black text-slate-800 mt-2">{declarations.length}</p>
              <div className="flex gap-3 mt-4">
                <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{declarations.filter(d => d.status === "paid").length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">مدفوع</p>
                </div>
                <div className="flex-1 bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-orange-600">{declarations.filter(d => d.status === "pending").length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">قيد المعالجة</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Archive Table */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 p-8 border border-slate-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              سجل التصريحات
            </h2>
            <div className="flex gap-2">
              {(["all", "paid", "pending"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === f ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  data-testid={`filter-${f}`}
                >
                  {f === "all" ? "الكل" : f === "paid" ? "مدفوع" : "قيد المعالجة"}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">لا توجد تصريحات بعد</p>
              <p className="text-sm mt-1">انقر على "تصريح جديد" لإضافة أول تصريح</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-4 text-slate-500 font-medium px-3 text-sm">الفترة</th>
                    <th className="pb-4 text-slate-500 font-medium px-3 text-sm">النوع</th>
                    <th className="pb-4 text-slate-500 font-medium px-3 text-sm">رقم الأعمال</th>
                    <th className="pb-4 text-slate-500 font-medium px-3 text-sm">المبلغ المستحق</th>
                    <th className="pb-4 text-slate-500 font-medium px-3 text-sm">الحالة</th>
                    <th className="pb-4 text-slate-500 font-medium px-3 text-sm">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => {
                    const total = d.tax_type === "G12"
                      ? parseFloat(d.tax_amount ?? "0")
                      : (parseFloat(d.tap_amount ?? "0") + parseFloat(d.tva_amount ?? "0") + parseFloat(d.irg_amount ?? "0"));
                    const isPaid = d.status === "paid";
                    return (
                      <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-3 font-mono text-sm text-slate-700">{d.period}</td>
                        <td className="py-4 px-3">
                          <Badge variant="outline" className={`font-semibold text-xs ${d.tax_type === "G12" ? "border-blue-300 text-blue-600 bg-blue-50" : "border-orange-300 text-orange-600 bg-orange-50"}`}>
                            {d.tax_type}
                          </Badge>
                        </td>
                        <td className="py-4 px-3 font-mono text-slate-700">
                          {d.revenue ? fmt(parseFloat(d.revenue)) : "—"}
                        </td>
                        <td className="py-4 px-3 font-mono font-bold text-slate-800">
                          {total > 0 ? fmt(total) : "—"}
                        </td>
                        <td className="py-4 px-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isPaid ? "text-green-700 bg-green-50" : "text-orange-700 bg-orange-50"}`}>
                            {isPaid ? "مدفوع" : "قيد المعالجة"}
                          </span>
                        </td>
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-2">
                            {!isPaid && (
                              <button
                                onClick={() => handleMarkPaid(d.id)}
                                className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
                                data-testid={`btn-mark-paid-${d.id}`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                دفع
                              </button>
                            )}
                            <button
                              onClick={() => toast({ title: "قريباً", description: "تحميل PDF قيد التطوير" })}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                              data-testid={`btn-download-${d.id}`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <TaxWizard open={wizardOpen} onClose={() => setWizardOpen(false)} isIFU={isIFU} companyId={companyId} />
    </PageLayout>
  );
}
