import React, { useState, useMemo } from "react";
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
import { supabase } from "@/lib/supabase";
import {
  useListDeclarations,
  useCreateDeclaration,
  useUpdateDeclarationStatus,
  getListDeclarationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, FileText, Plus, Download, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Calculator, Eye, ShieldCheck, AlertTriangle,
  Pencil, Trash2, X, CreditCard, Lock, Wifi,
} from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// ─── Constants ───────────────────────────────────────────────────────────────

const IFU_MINIMUM_TAX  = 30_000;    // الحد الأدنى للضريبة الجزافية — يُدفع كاملاً عند التصريح
const IFU_REVENUE_CAP  = 8_000_000; // السقف القانوني لنظام IFU

const IFU_ACTIVITY_TYPES = [
  { value: "production", label: "إنتاج وبيع السلع",          rate: 0.05, rateLabel: "5%" },
  { value: "services",   label: "الأنشطة الأخرى / الخدمات", rate: 0.12, rateLabel: "12%" },
] as const;

type ActivityType = (typeof IFU_ACTIVITY_TYPES)[number]["value"];

// ─── Payment Options (IFU – 2 valid options per regulations) ─────────────────

interface IFUPaymentOption {
  label: string;
  installments: Array<{ label: string; period: string; amount: number }>;
}

function getPaymentOptions(totalTax: number, year: number): [IFUPaymentOption, IFUPaymentOption] {
  const half    = Math.round(totalTax * 0.50);
  const quarter = Math.round(totalTax * 0.25);
  const last    = totalTax - half - quarter;

  return [
    {
      label: "الدفع الكامل عند الإيداع",
      installments: [
        { label: "المبلغ الإجمالي", period: `1 فيفري – 30 جوان ${year}`, amount: totalTax },
      ],
    },
    {
      label: "الدفع بالتقسيط (خيار 2)",
      installments: [
        { label: "50% عند الإيداع",   period: `1 فيفري – 30 جوان ${year}`, amount: half    },
        { label: "25% القسط الأول",   period: `قبل 15 سبتمبر ${year}`,     amount: quarter },
        { label: "25% القسط الثاني",  period: `قبل 15 ديسمبر ${year}`,     amount: last    },
      ],
    },
  ];
}

// ─── Deadline helper ──────────────────────────────────────────────────────────

function currentDeadline(taxType: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  if (taxType === "G12") {
    // Filing period: 1 Feb – 30 Jun  →  then installments: Sep 15, Dec 15
    // G12 bis (final): before 15 Feb of next year
    type Slot = { label: string; month: number; day: number; nextYear?: boolean };
    const slots: Slot[] = [
      { label: "إيداع G12 التقديري",      month: 5,  day: 30 },          // Jun 30
      { label: "القسط الأول (25%)",       month: 8,  day: 15 },          // Sep 15
      { label: "القسط الثاني (25%)",      month: 11, day: 15 },          // Dec 15
      { label: "إيداع G12 bis النهائي",   month: 1,  day: 15, nextYear: true }, // Feb 15
    ];
    const next =
      slots.find(s => !s.nextYear && s.month > m) ??
      slots.find(s => !s.nextYear && s.month === m && s.day >= now.getDate()) ??
      slots.find(s => s.nextYear) ??
      slots[0];
    const deadline = new Date(y + (next.nextYear ? 1 : 0), next.month, next.day);
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
    return { label: `IFU – ${next.label}`, date: deadline.toLocaleDateString("fr-DZ"), daysLeft, urgent: daysLeft <= 14 };
  }

  const deadlineDay = 20;
  const deadlineMonth = now.getDate() > deadlineDay ? m + 1 : m;
  const deadline = new Date(y, deadlineMonth, deadlineDay);
  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
  const monthName = deadline.toLocaleString("ar-DZ", { month: "long" });
  return { label: `G50 – ${monthName} ${y}`, date: deadline.toLocaleDateString("fr-DZ"), daysLeft, urgent: daysLeft <= 7 };
}

function fmt(n: number) {
  return n.toLocaleString("fr-DZ") + " دج";
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ifuSchema = z.object({
  period: z.string().min(4, "حدد السنة المالية (مثال: 2024)"),
  revenue: z.string().min(1, "أدخل رقم الأعمال السنوي"),
  activity_type: z.enum(["production", "services"], { required_error: "حدد نوع النشاط" }),
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
  exceedsCap: boolean;
  options: [IFUPaymentOption, IFUPaymentOption];
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
    exceedsCap: revenue > IFU_REVENUE_CAP,
    options: getPaymentOptions(tax, year),
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
  const [paymentOptionIdx, setPaymentOptionIdx] = useState<0 | 1>(0);
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

  const handleReset = () => { setStep(1); setIfuPreview(null); setG50Preview(null); setPaymentOptionIdx(0); ifuForm.reset(); g50Form.reset(); };
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

      // Build payment_plan JSON for IFU split-payment option
      let payment_plan: string | undefined;
      if (isIFU && ifuPreview && paymentOptionIdx === 1) {
        const installments = ifuPreview.options[1].installments.map(inst => ({
          label:  inst.label,
          period: inst.period,
          amount: inst.amount,
          status: "pending",
        }));
        payment_plan = JSON.stringify(installments);
      }

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
          payment_plan,
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
                <FormField control={ifuForm.control} name="revenue" render={({ field }) => {
                  const rev = parseFloat((field.value || "0").replace(/[\s,]/g, ""));
                  const overCap = !isNaN(rev) && rev > IFU_REVENUE_CAP;
                  return (
                    <FormItem>
                      <FormLabel>رقم الأعمال التقديري للسنة (دج)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="5 000 000" className="rounded-xl text-left font-mono" dir="ltr" data-testid="input-revenue" />
                      </FormControl>
                      {overCap ? (
                        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 inline" />
                          رقم الأعمال يتجاوز السقف القانوني لنظام IFU ({fmt(IFU_REVENUE_CAP)}) — سيتم تحويلك إلى النظام الحقيقي
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">السقف القانوني لنظام IFU: {fmt(IFU_REVENUE_CAP)}</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }} />
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

              {/* Revenue cap warning */}
              {ifuPreview.exceedsCap && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-700 font-medium">
                    رقم الأعمال يتجاوز السقف القانوني ({fmt(IFU_REVENUE_CAP)}). سيتم تحويلك تلقائياً إلى النظام الحقيقي في السنة القادمة.
                  </p>
                </div>
              )}

              {/* Payment Options */}
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-700">اختر طريقة الدفع</h4>
                <div className="grid grid-cols-2 gap-2">
                  {ifuPreview.options.map((opt, i) => (
                    <button key={i} type="button" onClick={() => setPaymentOptionIdx(i as 0 | 1)}
                      className={`text-xs px-3 py-2 rounded-xl font-semibold border-2 transition-colors ${paymentOptionIdx === i ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-blue-300 bg-white"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                  {ifuPreview.options[paymentOptionIdx].installments.map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{s.label}</p>
                        <p className="text-xs text-slate-400">{s.period}</p>
                      </div>
                      <span className="font-mono font-bold text-blue-600 text-sm">{fmt(s.amount)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  فترة الإيداع: 1 فيفري – 30 جوان {ifuPreview.year} • الحد الأدنى: {fmt(IFU_MINIMUM_TAX)}
                </p>
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

// ─── Edit Declaration Modal ───────────────────────────────────────────────────

type DeclarationRow = {
  id: string;
  period?: string | null;
  tax_type?: string | null;
  revenue?: string | null;
  tax_rate?: string | null;
  tax_amount?: string | null;
  tap_amount?: string | null;
  tva_amount?: string | null;
  irg_amount?: string | null;
  purchases?: string | null;
  salaries?: string | null;
  status?: string | null;
  notes?: string | null;
};

const editIfuSchema = z.object({
  period:        z.string().min(4, "حدد السنة"),
  revenue:       z.string().min(1, "أدخل رقم الأعمال"),
  activity_type: z.enum(["production", "services"]),
});

const editG50Schema = z.object({
  period:    z.string().min(4, "حدد الفترة"),
  revenue:   z.string().min(1, "أدخل المبيعات"),
  purchases: z.string().optional(),
  salaries:  z.string().optional(),
});

function activityFromRateStr(rate?: string | null): "production" | "services" {
  const r = parseFloat(rate ?? "0");
  if (r >= 0.10) return "services";
  return "production";
}

function EditDeclarationModal({
  declaration, onClose, onSaved, token,
}: {
  declaration: DeclarationRow;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const isIFU = declaration.tax_type === "G12";

  const ifuForm = useForm({
    resolver: zodResolver(editIfuSchema),
    defaultValues: {
      period:        declaration.period ?? "",
      revenue:       declaration.revenue ?? "",
      activity_type: activityFromRateStr(declaration.tax_rate),
    },
  });

  const g50Form = useForm({
    resolver: zodResolver(editG50Schema),
    defaultValues: {
      period:    declaration.period ?? "",
      revenue:   declaration.revenue ?? "",
      purchases: declaration.purchases ?? "",
      salaries:  declaration.salaries ?? "",
    },
  });

  const handleSaveIFU = ifuForm.handleSubmit(async (vals) => {
    const rev = parseFloat(vals.revenue.replace(/[\s,]/g, "")) || 0;
    const actInfo = IFU_ACTIVITY_TYPES.find(a => a.value === vals.activity_type)!;
    const rawTax = Math.round(rev * actInfo.rate);
    const tax = Math.max(rawTax, IFU_MINIMUM_TAX);
    await save({
      period: vals.period, tax_type: "G12",
      revenue: String(rev), tax_rate: String(actInfo.rate), tax_amount: String(tax),
      status: declaration.status ?? "pending",
    });
  });

  const handleSaveG50 = g50Form.handleSubmit(async (vals) => {
    const rev   = parseFloat(vals.revenue.replace(/[\s,]/g, "")) || 0;
    const purch = parseFloat((vals.purchases ?? "0").replace(/[\s,]/g, "")) || 0;
    const sal   = parseFloat((vals.salaries  ?? "0").replace(/[\s,]/g, "")) || 0;
    const tap = Math.round(rev * 0.02);
    const tva = Math.round((rev - purch) * 0.19);
    const irg = Math.round(sal * 0.10);
    await save({
      period: vals.period, tax_type: "G50",
      revenue: String(rev), purchases: String(purch), salaries: String(sal),
      tap_amount: String(tap), tva_amount: String(tva), irg_amount: String(irg),
      status: declaration.status ?? "pending",
    });
  });

  async function save(body: Record<string, string>) {
    setSaving(true);
    try {
      const resp = await fetch(`/api/declarations/${declaration.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`خطأ ${resp.status}`);
      toast({ title: "تم الحفظ", description: "تم تحديث التصريح بنجاح" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden" dir="rtl">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] px-6 py-5 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Pencil className="w-4 h-4 text-orange-400" />
              تعديل التصريح
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-xs mt-1">
            {isIFU ? "تصريح IFU (G12)" : "تصريح G50"} — الفترة: {declaration.period}
          </p>
        </div>

        <div className="p-6">
          {isIFU ? (
            <Form {...ifuForm}>
              <form onSubmit={handleSaveIFU} className="space-y-4">
                <FormField control={ifuForm.control} name="period" render={({ field }) => (
                  <FormItem>
                    <FormLabel>السنة المالية</FormLabel>
                    <FormControl><Input {...field} placeholder="2024" className="rounded-xl font-mono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={ifuForm.control} name="revenue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الأعمال السنوي (دج)</FormLabel>
                    <FormControl><Input {...field} placeholder="5 000 000" className="rounded-xl font-mono" dir="ltr" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={ifuForm.control} name="activity_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع النشاط</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-1 gap-2">
                        {IFU_ACTIVITY_TYPES.map(opt => (
                          <button key={opt.value} type="button" onClick={() => field.onChange(opt.value)}
                            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors text-right ${field.value === opt.value ? "bg-blue-500 border-blue-500 text-white" : "border-slate-200 text-slate-700 hover:border-blue-300 bg-white"}`}>
                            <span>{opt.label}</span>
                            <span className={`font-mono font-bold ${field.value === opt.value ? "text-white" : "text-blue-600"}`}>{opt.rateLabel}</span>
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl">إلغاء</Button>
                  <Button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">
                    {saving ? <i className="fas fa-spinner fa-spin" /> : "حفظ التعديلات"}
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <Form {...g50Form}>
              <form onSubmit={handleSaveG50} className="space-y-4">
                <FormField control={g50Form.control} name="period" render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفترة</FormLabel>
                    <FormControl><Input {...field} placeholder="2024-03" className="rounded-xl font-mono" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={g50Form.control} name="revenue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الأعمال (دج)</FormLabel>
                    <FormControl><Input {...field} placeholder="850 000" className="rounded-xl font-mono" dir="ltr" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={g50Form.control} name="purchases" render={({ field }) => (
                    <FormItem>
                      <FormLabel>المشتريات (دج)</FormLabel>
                      <FormControl><Input {...field} placeholder="200 000" className="rounded-xl font-mono" dir="ltr" /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={g50Form.control} name="salaries" render={({ field }) => (
                    <FormItem>
                      <FormLabel>الأجور (دج)</FormLabel>
                      <FormControl><Input {...field} placeholder="150 000" className="rounded-xl font-mono" dir="ltr" /></FormControl>
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl">إلغاء</Button>
                  <Button type="submit" disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold">
                    {saving ? <i className="fas fa-spinner fa-spin" /> : "حفظ التعديلات"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

interface PaymentTarget {
  id: string;
  taxType: string;
  period: string;
  amount: number;
}

type CardType = "cib" | "edahabia";
type PayStep  = "form" | "processing" | "success";

function formatCardNum(raw: string) {
  return raw.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0,2)}/${digits.slice(2)}` : digits;
}

function PaymentModal({
  target,
  onClose,
  onSuccess,
}: {
  target: PaymentTarget | null;
  onClose: () => void;
  onSuccess: (id: string) => void;
}) {
  const [cardType, setCardType] = useState<CardType>("cib");
  const [cardNum, setCardNum]   = useState("");
  const [holder, setHolder]     = useState("");
  const [expiry, setExpiry]     = useState("");
  const [cvv, setCvv]           = useState("");
  const [step, setStep]         = useState<PayStep>("form");

  if (!target) return null;

  const fmt = (n: number) => n.toLocaleString("ar-DZ") + " دج";

  const handlePay = () => {
    setStep("processing");
    setTimeout(() => {
      setStep("success");
      setTimeout(() => {
        onSuccess(target.id);
        onClose();
      }, 1800);
    }, 2200);
  };

  const cardFilled = cardNum.replace(/\s/g, "").length === 16 && holder.trim() && expiry.length === 5 && cvv.length >= 3;

  const isCib = cardType === "cib";
  const cardBg = isCib
    ? "from-blue-800 to-blue-600"
    : "from-amber-600 to-yellow-400";
  const cardAccent = isCib ? "text-blue-200" : "text-yellow-100";

  return (
    <Dialog open={!!target} onOpenChange={() => { if (step !== "processing") onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-2xl" dir="rtl">

        {/* Demo Banner */}
        <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-5 py-2.5 text-xs text-amber-700">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
          <span>وضع تجريبي — لن يتم خصم أي مبلغ حقيقي</span>
        </div>

        {step === "success" ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center animate-pulse">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-slate-800">تمت عملية الدفع</p>
              <p className="text-sm text-slate-500 mt-1">{fmt(target.amount)} — {target.period}</p>
            </div>
          </div>
        ) : step === "processing" ? (
          <div className="flex flex-col items-center justify-center gap-5 py-16 px-6">
            <div className="w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-slate-700">جارٍ معالجة الدفع...</p>
              <p className="text-sm text-slate-400 mt-1">يرجى الانتظار</p>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader className="px-6 pt-5 pb-3">
              <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                دفع إلكتروني
              </DialogTitle>
              <p className="text-sm text-slate-500 mt-0.5">
                {target.taxType} — الفترة: {target.period}
              </p>
              <div className="mt-2 bg-slate-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-slate-500">المبلغ الواجب دفعه</span>
                <span className="text-xl font-mono font-bold text-slate-800">{fmt(target.amount)}</span>
              </div>
            </DialogHeader>

            <div className="px-6 pb-6 space-y-5">
              {/* Card type selector */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">نوع البطاقة</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["cib", "edahabia"] as CardType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setCardType(type)}
                      className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all ${
                        cardType === type
                          ? type === "cib"
                            ? "border-blue-500 bg-blue-50"
                            : "border-amber-500 bg-amber-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      {type === "cib" ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-md bg-blue-700 flex items-center justify-center">
                              <CreditCard className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-bold text-blue-800 text-base tracking-wide">CIB</span>
                          </div>
                          <span className="text-xs text-slate-500">بطاقة بنكية</span>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
                              <span className="text-white font-bold text-xs">ذ</span>
                            </div>
                            <span className="font-bold text-amber-700 text-sm">الذهبية</span>
                          </div>
                          <span className="text-xs text-slate-500">Edahabia</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Virtual card preview */}
              <div className={`relative h-36 rounded-2xl bg-gradient-to-br ${cardBg} p-5 overflow-hidden shadow-lg`}>
                <Wifi className={`absolute top-4 left-5 w-6 h-6 ${cardAccent} rotate-90`} />
                <div className={`text-xs font-medium ${cardAccent} mb-4`}>
                  {isCib ? "Carte Interbancaire CIB" : "Edahabia — الذهبية"}
                </div>
                <div className="font-mono text-white text-lg tracking-[0.2em] mb-3">
                  {cardNum || "•••• •••• •••• ••••"}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-xs ${cardAccent}`}>حامل البطاقة</p>
                    <p className="text-white text-sm font-medium truncate max-w-[160px]">
                      {holder || "الاسم الكامل"}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className={`text-xs ${cardAccent}`}>صلاحية</p>
                    <p className="text-white text-sm font-mono">{expiry || "MM/AA"}</p>
                  </div>
                </div>
              </div>

              {/* Card inputs */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">رقم البطاقة</label>
                  <div className="relative">
                    <Input
                      value={cardNum}
                      onChange={e => setCardNum(formatCardNum(e.target.value))}
                      placeholder="0000 0000 0000 0000"
                      className="font-mono text-sm pl-10 tracking-widest"
                      maxLength={19}
                      dir="ltr"
                    />
                    <CreditCard className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">اسم حامل البطاقة</label>
                  <Input
                    value={holder}
                    onChange={e => setHolder(e.target.value.toUpperCase())}
                    placeholder="NOM PRENOM"
                    className="font-mono text-sm uppercase tracking-wide"
                    dir="ltr"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">تاريخ الانتهاء</label>
                    <Input
                      value={expiry}
                      onChange={e => setExpiry(formatExpiry(e.target.value))}
                      placeholder="MM/AA"
                      className="font-mono text-sm text-center"
                      maxLength={5}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">رمز CVV</label>
                    <div className="relative">
                      <Input
                        value={cvv}
                        onChange={e => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="•••"
                        type="password"
                        className="font-mono text-sm text-center pl-8"
                        maxLength={4}
                        dir="ltr"
                      />
                      <Lock className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Pay button */}
              <button
                onClick={handlePay}
                disabled={!cardFilled}
                className={`w-full py-3.5 rounded-xl font-bold text-white text-base transition-all flex items-center justify-center gap-2 ${
                  isCib
                    ? "bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300"
                    : "bg-amber-500 hover:bg-amber-600 disabled:bg-amber-200"
                } disabled:cursor-not-allowed shadow-lg`}
                data-testid="btn-pay-now"
              >
                <Lock className="w-4 h-4" />
                تأكيد الدفع — {fmt(target.amount)}
              </button>
              <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                دفع آمن ومشفر
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Taxes Page ──────────────────────────────────────────────────────────

export default function TaxesPage() {
  const { selectedCompany } = useCompany();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [editingDeclaration, setEditingDeclaration] = useState<DeclarationRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string>("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [payingInstallmentKey, setPayingInstallmentKey] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateStatus = useUpdateDeclarationStatus();

  const getToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";
    setSessionToken(token);
    return token;
  };

  const handleOpenEdit = async (d: DeclarationRow) => {
    await getToken();
    setEditingDeclaration(d);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const token = await getToken();
      const resp = await fetch(`/api/declarations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok && resp.status !== 204) throw new Error(`خطأ ${resp.status}`);
      queryClient.invalidateQueries({ queryKey: getListDeclarationsQueryKey({ company_id: companyId }) });
      toast({ title: "تم الحذف", description: "تم حذف التصريح بنجاح" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في الحذف", description: err.message });
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePayInstallment = async (declarationId: string, index: number) => {
    const key = `${declarationId}-${index}`;
    setPayingInstallmentKey(key);
    try {
      const token = await getToken();
      const resp = await fetch(`/api/declarations/${declarationId}/installments/${index}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "paid" }),
      });
      if (!resp.ok) throw new Error(`خطأ ${resp.status}`);
      queryClient.invalidateQueries({ queryKey: getListDeclarationsQueryKey({ company_id: companyId }) });
      toast({ title: "تم الدفع", description: "تم تسجيل دفع القسط بنجاح" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally {
      setPayingInstallmentKey(null);
    }
  };

  const handleDownloadPDF = async (declarationId: string, taxType: string, pdfVariant: "G12" | "G12Bis" | "G50" = "G12") => {
    try {
      setDownloadingId(declarationId + pdfVariant);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("غير مسجل الدخول");

      const resp = await fetch(
        `/api/generate-tax-pdf?declaration_id=${declarationId}&type=${pdfVariant}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (!resp.ok) throw new Error(`خطأ ${resp.status}`);

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfVariant}_${declarationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في التحميل", description: err.message });
    } finally {
      setDownloadingId(null);
    }
  };

  const isIFU = selectedCompany?.tax_regime === "IFU";
  const hasStartupLabel = selectedCompany?.has_startup_label === true;
  const companyId = selectedCompany?.id ?? "";

  const { data: declarations = [], isLoading } = useListDeclarations(
    { company_id: companyId },
    { query: { enabled: !!companyId, queryKey: getListDeclarationsQueryKey({ company_id: companyId }) } }
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

  const handlePaymentSuccess = (id: string) => {
    handleMarkPaid(id);
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
                نسب IFU المعتمدة لعام 2026
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IFU_ACTIVITY_TYPES.map(a => (
                  <div key={a.value} className="bg-white rounded-xl p-4 border border-blue-100">
                    <p className="text-2xl font-black text-blue-600 font-mono">{a.rateLabel}</p>
                    <p className="text-sm text-slate-700 font-medium mt-1">{a.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span>الحد الأدنى الجبائي: <span className="font-mono font-semibold text-slate-700">{fmt(IFU_MINIMUM_TAX)}</span></span>
                <span>السقف القانوني: <span className="font-mono font-semibold text-slate-700">{fmt(IFU_REVENUE_CAP)}</span></span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                فترة الإيداع (G12): 1 فيفري – 30 جوان • التصريح النهائي (G12 bis): قبل 15 فيفري من السنة الموالية
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

                    type Installment = { label: string; period: string; amount: number; status: string };
                    const installments: Installment[] = (d as any).payment_plan
                      ? JSON.parse((d as any).payment_plan)
                      : [];
                    const hasInstallments = installments.length > 0;
                    const isExpanded = expandedIds.has(d.id);
                    const paidCount = installments.filter(i => i.status === "paid").length;

                    return (
                      <React.Fragment key={d.id}>
                      <tr className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-3 font-mono text-sm text-slate-700">
                          <div className="flex items-center gap-1">
                            {d.period}
                            {hasInstallments && (
                              <button onClick={() => toggleExpand(d.id)} className="text-slate-400 hover:text-blue-500 transition-colors" title="عرض الأقساط">
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                          {hasInstallments && (
                            <p className="text-xs text-blue-500 font-medium mt-0.5">
                              {paidCount}/{installments.length} أقساط مدفوعة
                            </p>
                          )}
                        </td>
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {!isPaid && (
                              <button
                                onClick={() => setPaymentTarget({
                                  id: d.id,
                                  taxType: d.tax_type ?? "",
                                  period: d.period ?? "",
                                  amount: total,
                                })}
                                className="flex items-center gap-1 text-xs text-white font-semibold px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
                                data-testid={`btn-pay-electronic-${d.id}`}
                                title="دفع إلكتروني بالبطاقة"
                              >
                                <CreditCard className="w-3.5 h-3.5" /> دفع إلكتروني
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEdit(d as DeclarationRow)}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                              data-testid={`btn-edit-${d.id}`}
                              title="تعديل التصريح"
                            >
                              <Pencil className="w-3.5 h-3.5" /> تعديل
                            </button>
                            {deleteConfirmId === d.id ? (
                              <span className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(d.id)}
                                  disabled={deletingId === d.id}
                                  className="text-xs text-white bg-red-500 hover:bg-red-600 font-semibold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                  data-testid={`btn-confirm-delete-${d.id}`}
                                >
                                  {deletingId === d.id ? <i className="fas fa-spinner fa-spin" /> : "تأكيد"}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                  data-testid={`btn-cancel-delete-${d.id}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(d.id)}
                                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors"
                                data-testid={`btn-delete-${d.id}`}
                                title="حذف التصريح"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {d.tax_type === "G12" ? (
                              <>
                                <button
                                  onClick={() => handleDownloadPDF(d.id, d.tax_type ?? "", "G12")}
                                  disabled={downloadingId === d.id + "G12"}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50"
                                  data-testid={`btn-download-g12-${d.id}`}
                                  title="تحميل التصريح التقديري G12"
                                >
                                  {downloadingId === d.id + "G12"
                                    ? <i className="fas fa-spinner fa-spin w-3.5 h-3.5" />
                                    : <Download className="w-3.5 h-3.5" />}
                                  G12
                                </button>
                                <button
                                  onClick={() => handleDownloadPDF(d.id, d.tax_type ?? "", "G12Bis")}
                                  disabled={downloadingId === d.id + "G12Bis"}
                                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                                  data-testid={`btn-download-g12bis-${d.id}`}
                                  title="تحميل التصريح النهائي G12 مكرر"
                                >
                                  {downloadingId === d.id + "G12Bis"
                                    ? <i className="fas fa-spinner fa-spin w-3.5 h-3.5" />
                                    : <Download className="w-3.5 h-3.5" />}
                                  G12 مكرر
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleDownloadPDF(d.id, d.tax_type ?? "", "G50")}
                                disabled={downloadingId === d.id + "G50"}
                                className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-colors disabled:opacity-50"
                                data-testid={`btn-download-g50-${d.id}`}
                                title="تحميل تصريح G50"
                              >
                                {downloadingId === d.id + "G50"
                                  ? <i className="fas fa-spinner fa-spin w-3.5 h-3.5" />
                                  : <Download className="w-3.5 h-3.5" />}
                                G50
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Installment sub-rows */}
                      {hasInstallments && isExpanded && installments.map((inst, i) => {
                        const instPaid = inst.status === "paid";
                        const instKey = `${d.id}-${i}`;
                        return (
                          <tr key={instKey} className="bg-blue-50/60 border-b border-blue-100">
                            <td className="py-3 px-6 pr-10" colSpan={3}>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${instPaid ? "bg-green-500" : "bg-orange-400"}`} />
                                <div>
                                  <p className="text-xs font-semibold text-slate-700">{inst.label}</p>
                                  <p className="text-xs text-slate-400">{inst.period}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-blue-700 text-sm">
                              {fmt(inst.amount)}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${instPaid ? "text-green-700 bg-green-100" : "text-orange-700 bg-orange-100"}`}>
                                {instPaid ? "مدفوع" : "معلق"}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {!instPaid && (
                                <button
                                  onClick={() => handlePayInstallment(d.id, i)}
                                  disabled={payingInstallmentKey === instKey}
                                  className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-semibold px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 border border-green-200 transition-colors disabled:opacity-50"
                                  data-testid={`btn-pay-installment-${d.id}-${i}`}
                                >
                                  {payingInstallmentKey === instKey
                                    ? <i className="fas fa-spinner fa-spin" />
                                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                                  دفع
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      </React.Fragment>
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

      {editingDeclaration && sessionToken && (
        <EditDeclarationModal
          declaration={editingDeclaration}
          token={sessionToken}
          onClose={() => setEditingDeclaration(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: getListDeclarationsQueryKey({ company_id: companyId }) })}
        />
      )}

      <PaymentModal
        target={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSuccess={handlePaymentSuccess}
      />
    </PageLayout>
  );
}
