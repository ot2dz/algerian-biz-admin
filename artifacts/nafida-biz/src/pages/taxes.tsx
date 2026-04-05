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
import {
  CalendarClock, FileText, Plus, Download, CheckCircle2,
  ChevronLeft, ChevronRight, Calculator, Eye, ShieldCheck, AlertTriangle,
} from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// ─── Constants ───────────────────────────────────────────────────────────────

const IFU_MINIMUM_TAX = 10_000; // الحد الأدنى للضريبة الجزافية بالدينار الجزائري

const IFU_ACTIVITY_TYPES = [
  { value: "production", label: "إنتاج وبيع السلع", rate: 0.05, rateLabel: "5%" },
  { value: "services",   label: "تقديم الخدمات",   rate: 0.12, rateLabel: "12%" },
  { value: "digital",    label: "رقمي / Auto-entrepreneur", rate: 0.005, rateLabel: "0.5%" },
] as const;

type ActivityType = (typeof IFU_ACTIVITY_TYPES)[number]["value"];

// ─── Payment Schedule ─────────────────────────────────────────────────────────

function getPaymentSchedule(totalTax: number, year: number) {
  const q1 = Math.round(totalTax * 0.35);
  const q2 = Math.round(totalTax * 0.35);
  const q3 = totalTax - q1 - q2;
  return [
    { label: "القسط الأول (35%)",  period: `1-15 سبتمبر ${year}`,        amount: q1 },
    { label: "القسط الثاني (35%)", period: `1-15 ديسمبر ${year}`,        amount: q2 },
    { label: "القسط الثالث (30%)", period: `قبل 30 جوان ${year + 1}`, amount: q3 },
  ];
}

// ─── Deadline helper ──────────────────────────────────────────────────────────

function currentDeadline(taxType: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (taxType === "G12") {
    const slots = [
      { label: "القسط الأول", month: 8,  day: 15 },
      { label: "القسط الثاني", month: 11, day: 15 },
      { label: "القسط الثالث", month: 5,  day: 30, nextYear: true },
    ];
    const next =
      slots.find(s => !s.nextYear && s.month > m) ??
      slots.find(s => s.nextYear) ??
      slots[0];
    const deadline = new Date(y + (next.nextYear ? 1 : 0), next.month, next.day);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
    return { label: `IFU - ${next.label}`, date: deadline.toLocaleDateString("fr-DZ"), daysLeft, urgent: daysLeft <= 7 };
  }

  const deadlineDay = 20;
  const deadlineMonth = now.getDate() > deadlineDay ? m + 1 : m;
  const deadline = new Date(y, deadlineMonth, deadlineDay);
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  const monthName = deadline.toLocaleString("ar-DZ", { month: "long" });
  return { label: `G50 - ${monthName} ${y}`, date: deadline.toLocaleDateString("fr-DZ"), daysLeft, urgent: daysLeft <= 7 };
}

function fmt(n: number) {
  return n.toLocaleString("fr-DZ") + " دج";
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ifuSchema = z.object({
  period: z.string().min(4, "حدد السنة المالية (مثال: 2024)"),
  revenue: z.string().min(1, "أدخل رقم الأعمال السنوي"),
  activity_type: z.enum(["production", "services", "digital"], { required_error: "حدد نوع النشاط" }),
});

const g50Schema = z.object({
  period: z.string().min(4, "حدد الفترة (مثال: 2024-03)"),
  revenue: z.string().min(1, "أدخل رقم المبيعات"),
  purchases: z.string().optional(),
  salaries: z.string().optional(),
});

// ─── IFU Calculation ─────────────────────────────────────────────────────────

interface IFUPreview {
  revenue: number;
  rate: number;
  rateLabel: string;
  rawTax: number;
  tax: number;
  minimumApplied: boolean;
  schedule: ReturnType<typeof getPaymentSchedule>;
  year: number;
}

function calcIFUTax(revenue: number, activityType: ActivityType, year: number): IFUPreview {
  const activity = IFU_ACTIVITY_TYPES.find(a => a.value === activityType)!;
  const rawTax = Math.round(revenue * activity.rate);
  const tax = Math.max(rawTax, IFU_MINIMUM_TAX);
  return {
    revenue,
    rate: activity.rate,
    rateLabel: activity.rateLabel,
    rawTax,
    tax,
    minimumApplied: rawTax < IFU_MINIMUM_TAX,
    schedule: getPaymentSchedule(tax, year),
    year,
  };
}

// ─── G50 Preview ─────────────────────────────────────────────────────────────

interface G50Preview {
  revenue: number;
  purchases: number;
  salaries: number;
  tap: number;
  tva: number;
  irg: number;
  total: number;
}

// ─── Tax Wizard ───────────────────────────────────────────────────────────────

function TaxWizard({
  open, onClose, isIFU, companyId, hasStartupLabel,
}: {
  open: boolean;
  onClose: () => void;
  isIFU: boolean;
  companyId: string;
  hasStartupLabel: boolean;
}) {
  const [step, setStep] = useState(1);
  const [ifuPreview, setIfuPreview] = useState<IFUPreview | null>(null);
  const [g50Preview, setG50Preview] = useState<G50Preview | null>(null);
  const createDeclaration = useCreateDeclaration();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const ifuForm = useForm({
    resolver: zodResolver(ifuSchema),
    defaultValues: { period: String(new Date().getFullYear()), revenue: "", activity_type: "production" as ActivityType },
  });
  const g50Form = useForm({
    resolver: zodResolver(g50Schema),
    defaultValues: { period: "", revenue: "", purchases: "", salaries: "" },
  });

  const handleReset = () => { setStep(1); setIfuPreview(null); setG50Preview(null); ifuForm.reset(); g50Form.reset(); };
  const handleClose = () => { handleReset(); onClose(); };

  const onCalcIFU = ifuForm.handleSubmit((vals) => {
    const rev = parseFloat(vals.revenue.replace(/[\s,]/g, ""));
    if (isNaN(rev) || rev < 0) return;
    const year = parseInt(vals.period) || new Date().getFullYear();
    setIfuPreview(calcIFUTax(rev, vals.activity_type as ActivityType, year));
    setStep(2);
  });

  const onCalcG50 = g50Form.handleSubmit((vals) => {
    const rev = parseFloat(vals.revenue.replace(/[\s,]/g, "")) || 0;
    const purch = parseFloat((vals.purchases || "0").replace(/[\s,]/g, "")) || 0;
    const sal = parseFloat((vals.salaries || "0").replace(/[\s,]/g, "")) || 0;
    const tap = Math.round(rev * 0.02);
    const tva = Math.round((rev - purch) * 0.19);
    const irg = Math.round(sal * 0.10);
    setG50Preview({ revenue: rev, purchases: purch, salaries: sal, tap, tva, irg, total: tap + tva + irg });
    setStep(2);
  });

  const handleConfirm = async () => {
    try {
      const period = isIFU ? ifuForm.getValues().period : g50Form.getValues().period;
      await createDeclaration.mutateAsync({
        data: {
          company_id: companyId,
          period,
          tax_type: isIFU ? "G12" : "G50",
          revenue: isIFU ? String(ifuPreview!.revenue) : String(g50Preview!.revenue),
          tax_rate: isIFU ? String(ifuPreview!.rate) : undefined,
          tax_amount: isIFU ? String(ifuPreview!.tax) : undefined,
          tap_amount: !isIFU ? String(g50Preview!.tap) : undefined,
          tva_amount: !isIFU ? String(g50Preview!.tva) : undefined,
          irg_amount: !isIFU ? String(g50Preview!.irg) : undefined,
          purchases: !isIFU ? String(g50Preview!.purchases) : undefined,
          salaries: !isIFU ? String(g50Preview!.salaries) : undefined,
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
        {/* Header */}
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">معالج التصريح الجديد</DialogTitle>
          </DialogHeader>
          {!hasStartupLabel && (
            <div className="flex items-center gap-2 mt-4">
              {["إدخال البيانات", "الحساب الآلي", "التأكيد"].map((label, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${step > i + 1 ? "bg-orange-500 border-orange-500 text-white" : step === i + 1 ? "border-orange-400 text-orange-400" : "border-slate-600 text-slate-500"}`}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span className={`text-xs hidden sm:block ${step >= i + 1 ? "text-orange-400" : "text-slate-500"}`}>{label}</span>
                  {i < 2 && <div className="flex-1 h-px bg-slate-700 mx-1" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6">
          {/* Startup Label Exemption */}
          {hasStartupLabel && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">معفاة من IFU</h3>
                <p className="text-slate-500 text-sm mt-2">
                  شركتك الناشئة الحاصلة على Label مؤهلة للإعفاء الكامل من الضريبة الجزافية الوحيدة (IFU) لعدة سنوات.
                  لا يوجد ما يجب دفعه حالياً.
                </p>
              </div>
              <div className="bg-green-50 rounded-2xl p-4 text-right">
                <p className="text-xs text-green-700 font-medium">
                  بناءً على المادة 282 من قانون الضرائب المباشرة، يُعفى حاملو Label الناشئة من الضريبة الجزافية الوحيدة لمدة تصل إلى 3 سنوات.
                </p>
              </div>
              <Button onClick={handleClose} variant="outline" className="w-full rounded-xl">إغلاق</Button>
            </div>
          )}

          {/* IFU Step 1 */}
          {!hasStartupLabel && step === 1 && isIFU && (
            <Form {...ifuForm}>
              <form onSubmit={onCalcIFU} className="space-y-4">
                <FormField control={ifuForm.control} name="period" render={({ field }) => (
                  <FormItem>
                    <FormLabel>السنة المالية</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="2024" className="rounded-xl font-mono" data-testid="input-period" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={ifuForm.control} name="revenue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الأعمال السنوي (دج)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="5 000 000" className="rounded-xl text-left font-mono" dir="ltr" data-testid="input-revenue" />
                    </FormControl>
                    <p className="text-xs text-slate-400">أدخل رقم الأعمال الإجمالي للسنة كاملة</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={ifuForm.control} name="activity_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع النشاط</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-1 gap-2">
                        {IFU_ACTIVITY_TYPES.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => field.onChange(opt.value)}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium border-2 transition-colors text-right ${field.value === opt.value ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 text-slate-700 hover:border-blue-300 bg-white"}`}
                            data-testid={`btn-activity-${opt.value}`}
                          >
                            <span>{opt.label}</span>
                            <span className={`font-bold font-mono text-base ${field.value === opt.value ? "text-white" : "text-blue-600"}`}>{opt.rateLabel}</span>
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-5 font-bold flex items-center justify-center gap-2">
                  <Calculator className="w-4 h-4" /> حساب الضريبة الجزافية
                </Button>
              </form>
            </Form>
          )}

          {/* G50 Step 1 */}
          {!hasStartupLabel && step === 1 && !isIFU && (
            <Form {...g50Form}>
              <form onSubmit={onCalcG50} className="space-y-4">
                <FormField control={g50Form.control} name="period" render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفترة (الشهر)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="2024-03" className="rounded-xl font-mono" data-testid="input-period" />
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
                <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-5 font-bold flex items-center justify-center gap-2">
                  <Calculator className="w-4 h-4" /> حساب G50
                </Button>
              </form>
            </Form>
          )}

          {/* IFU Preview */}
          {!hasStartupLabel && step === 2 && isIFU && ifuPreview && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4 text-blue-600" /> نتيجة الحساب — IFU {ifuPreview.year}
                </h3>
                <div className="divide-y divide-slate-100">
                  <Row label="رقم الأعمال السنوي" value={fmt(ifuPreview.revenue)} />
                  <Row label="نسبة IFU" value={ifuPreview.rateLabel} />
                  <Row label="الضريبة المحسوبة" value={fmt(ifuPreview.rawTax)} />
                  {ifuPreview.minimumApplied && (
                    <div className="py-2.5 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      طُبِّق الحد الأدنى الجبائي (Minimum Fiscal: {fmt(IFU_MINIMUM_TAX)})
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 text-base font-bold text-blue-700 bg-blue-50 rounded-xl px-3 mt-1">
                    <span>المجموع السنوي المستحق</span>
                    <span className="font-mono">{fmt(ifuPreview.tax)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Schedule */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2">
                <h4 className="text-sm font-bold text-slate-700 mb-3">جدول الأقساط</h4>
                {ifuPreview.schedule.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{s.label}</p>
                      <p className="text-xs text-slate-400">{s.period}</p>
                    </div>
                    <span className="font-mono font-bold text-blue-600">{fmt(s.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-xl" data-testid="btn-wizard-back">
                  <ChevronRight className="w-4 h-4 ml-1" /> تعديل
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={createDeclaration.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold"
                  data-testid="btn-wizard-confirm"
                >
                  {createDeclaration.isPending ? <i className="fas fa-spinner fa-spin" /> : "حفظ التصريح"}
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </Button>
              </div>
            </div>
          )}

          {/* G50 Preview */}
          {!hasStartupLabel && step === 2 && !isIFU && g50Preview && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-2xl p-5 space-y-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4 text-orange-500" /> معاينة تصريح G50
                </h3>
                <div className="divide-y divide-slate-100">
                  <Row label="رقم الأعمال" value={fmt(g50Preview.revenue)} />
                  <Row label="TAP (2%)" value={fmt(g50Preview.tap)} />
                  <Row label="TVA (19% صافي)" value={fmt(g50Preview.tva)} />
                  <Row label="IRG (10% أجور)" value={fmt(g50Preview.irg)} />
                  <div className="flex justify-between py-2.5 text-base font-bold text-orange-600 bg-orange-50 rounded-xl px-3 mt-1">
                    <span>المجموع المستحق</span>
                    <span className="font-mono">{fmt(g50Preview.total)}</span>
                  </div>
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
                  {createDeclaration.isPending ? <i className="fas fa-spinner fa-spin" /> : "حفظ التصريح"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-semibold text-slate-800">{value}</span>
    </div>
  );
}

// ─── Main Taxes Page ──────────────────────────────────────────────────────────

export default function TaxesPage() {
  const { selectedCompany } = useCompany();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useUpdateDeclarationStatus();

  const isIFU = selectedCompany?.tax_regime === "IFU";
  const hasStartupLabel = selectedCompany?.has_startup_label === true;
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

  const regimeColor = isIFU ? "text-blue-600 bg-blue-50" : "text-orange-600 bg-orange-50";

  return (
    <PageLayout>
      <div className="space-y-8 max-w-6xl mx-auto p-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">إدارة الضرائب</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <p className="text-slate-500 text-sm">{selectedCompany?.company_name || "اختر شركة"}</p>
              {selectedCompany?.tax_regime && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${regimeColor}`}>
                  {isIFU ? "IFU - الضريبة الجزافية الوحيدة" : selectedCompany.tax_regime === "Real" ? "نظام حقيقي" : "RSI - نظام مبسط"}
                </span>
              )}
              {hasStartupLabel && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> معفاة — Label ناشئة
                </span>
              )}
            </div>
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
                  <p className="text-sm text-slate-500 mt-0.5">
                    آخر أجل: <span className="font-mono font-semibold">{deadline.date}</span>
                  </p>
                  {isIFU && !hasStartupLabel && (
                    <p className="text-xs text-slate-400 mt-1">الأقساط: 35% سبتمبر — 35% ديسمبر — 30% جوان</p>
                  )}
                  {hasStartupLabel && (
                    <p className="text-xs text-green-600 font-medium mt-1">لا يوجد أجل — شركتك معفاة من IFU</p>
                  )}
                </div>
                {!hasStartupLabel && (
                  <div className={`text-center px-4 py-3 rounded-2xl flex-shrink-0 ${deadline.urgent ? "bg-red-100" : isIFU ? "bg-blue-100" : "bg-orange-100"}`}>
                    <p className={`text-3xl font-black ${deadline.urgent ? "text-red-600" : isIFU ? "text-blue-600" : "text-primary"}`}>{deadline.daysLeft}</p>
                    <p className="text-xs text-slate-500 font-medium">يوم متبقي</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Stats */}
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

        {/* IFU Rates Reference Card */}
        {isIFU && (
          <Card className="border-0 shadow-xl shadow-slate-200/40 rounded-2xl bg-gradient-to-br from-blue-50 to-slate-50">
            <CardContent className="p-6">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" />
                جدول نسب IFU المعتمدة
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {IFU_ACTIVITY_TYPES.map(a => (
                  <div key={a.value} className="bg-white rounded-xl p-4 border border-blue-100">
                    <p className="text-2xl font-black text-blue-600 font-mono">{a.rateLabel}</p>
                    <p className="text-sm text-slate-700 font-medium mt-1">{a.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">
                الحد الأدنى الجبائي: <span className="font-mono font-semibold text-slate-600">{fmt(IFU_MINIMUM_TAX)}</span> — يُطبَّق حتى إذا كان رقم الأعمال صفراً
              </p>
            </CardContent>
          </Card>
        )}

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
                    {["الفترة", "النوع", "رقم الأعمال", "المبلغ المستحق", "الحالة", "الإجراءات"].map(h => (
                      <th key={h} className="pb-4 text-slate-500 font-medium px-3 text-sm">{h}</th>
                    ))}
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
                                <CheckCircle2 className="w-3.5 h-3.5" /> دفع
                              </button>
                            )}
                            <button
                              onClick={() => toast({ title: "قريباً", description: "تحميل PDF قيد التطوير" })}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                              data-testid={`btn-download-${d.id}`}
                            >
                              <Download className="w-3.5 h-3.5" /> PDF
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

      <TaxWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        isIFU={isIFU}
        companyId={companyId}
        hasStartupLabel={hasStartupLabel}
      />
    </PageLayout>
  );
}
