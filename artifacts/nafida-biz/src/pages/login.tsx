import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Mail, Lock, Eye, EyeOff, User, Phone, Building2,
  ChevronLeft, ChevronRight, Check, Briefcase, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
});

const step1Schema = z.object({
  first_name: z.string().min(2, "الاسم مطلوب"),
  last_name: z.string().min(2, "اللقب مطلوب"),
  phone: z.string().min(9, "رقم الهاتف غير صالح"),
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
});

const step3LegalSchema = z.object({
  company_name: z.string().min(2, "الاسم التجاري مطلوب"),
  company_type: z.string().min(1, "نوع الشركة مطلوب"),
  company_email: z.string().email("بريد غير صالح").or(z.literal("")).optional(),
  company_phone: z.string().optional(),
  address: z.string().min(3, "العنوان مطلوب"),
  rc_number: z.string().optional(),
  nif_number: z.string().optional(),
  nis_number: z.string().optional(),
  ai_number: z.string().optional(),
  has_tva: z.boolean().optional(),
  tva_number: z.string().optional(),
  director_name: z.string().min(2, "اسم المدير مطلوب"),
  director_id_card: z.string().optional(),
  director_role: z.string().optional(),
});

const step3NaturalSchema = z.object({
  activity: z.string().min(2, "النشاط التجاري مطلوب"),
  nif_number: z.string().optional(),
  rc_number: z.string().optional(),
});

const step4Schema = z.object({
  tax_regime: z.string().min(1, "اختر النظام الجبائي"),
  has_startup_label: z.boolean().optional(),
});

type LoginValues   = z.infer<typeof loginSchema>;
type Step1Values   = z.infer<typeof step1Schema>;
type Step3Legal    = z.infer<typeof step3LegalSchema>;
type Step3Natural  = z.infer<typeof step3NaturalSchema>;
type Step4Values   = z.infer<typeof step4Schema>;
type EntityType    = "legal" | "natural";
type RegStep       = 1 | 2 | 3 | 4 | "done";

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ["الحساب", "نوع النشاط", "بيانات النشاط", "النظام الجبائي"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={idx} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                done   ? "bg-orange-500 border-orange-500 text-white"
                : active ? "border-orange-500 text-orange-500"
                : "border-slate-300 text-slate-400"
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : idx}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active ? "text-orange-500" : done ? "text-orange-400" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${done ? "bg-orange-400" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children, optional }: { label: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label} {optional && <span className="text-slate-400 font-normal">(اختياري)</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  // Login / register toggle
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Registration multi-step state
  const [regStep, setRegStep] = useState<RegStep>(1);
  const [entityType, setEntityType] = useState<EntityType | null>(null);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [step3Legal, setStep3Legal] = useState<Step3Legal | null>(null);
  const [step3Natural, setStep3Natural] = useState<Step3Natural | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Forms
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { first_name: "", last_name: "", phone: "", email: "", password: "" },
  });

  const formLegal = useForm<Step3Legal>({
    resolver: zodResolver(step3LegalSchema),
    defaultValues: {
      company_name: "", company_type: "", company_email: "", company_phone: "",
      address: "", rc_number: "", nif_number: "", nis_number: "", ai_number: "",
      has_tva: false, tva_number: "", director_name: "", director_id_card: "", director_role: "",
    },
  });

  const formNatural = useForm<Step3Natural>({
    resolver: zodResolver(step3NaturalSchema),
    defaultValues: { activity: "", nif_number: "", rc_number: "" },
  });

  const form4 = useForm<Step4Values>({
    resolver: zodResolver(step4Schema),
    defaultValues: { tax_regime: "", has_startup_label: false },
  });

  // ── Login submit
  const onLogin = async (values: LoginValues) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) throw error;
      setLocation("/");
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في تسجيل الدخول", description: err.message });
    }
  };

  // ── Registration steps
  const onStep1 = (values: Step1Values) => {
    setStep1Data(values);
    setRegStep(2);
  };

  const onStep2 = (type: EntityType) => {
    setEntityType(type);
    setRegStep(3);
  };

  const onStep3Legal = (values: Step3Legal) => {
    setStep3Legal(values);
    setRegStep(4);
  };

  const onStep3Natural = (values: Step3Natural) => {
    setStep3Natural(values);
    setRegStep(4);
  };

  const onStep4 = async (values: Step4Values) => {
    if (!step1Data) return;
    setIsSubmitting(true);
    try {
      // 1. Create Supabase user
      const { error } = await supabase.auth.signUp({
        email: step1Data.email,
        password: step1Data.password,
        options: {
          data: {
            full_name: `${step1Data.first_name} ${step1Data.last_name}`,
            phone: step1Data.phone,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;

      // 2. Store pending business data in localStorage (completed after email confirmation)
      const pendingData = {
        profile: {
          first_name: step1Data.first_name,
          last_name: step1Data.last_name,
          phone: step1Data.phone,
          full_name: `${step1Data.first_name} ${step1Data.last_name}`,
        },
        company: {
          entity_type: entityType,
          tax_regime: values.tax_regime,
          has_startup_label: values.has_startup_label ?? false,
          ...(entityType === "legal" && step3Legal ? {
            company_name: step3Legal.company_name,
            company_type: step3Legal.company_type,
            email: step3Legal.company_email,
            phone: step3Legal.company_phone,
            address: step3Legal.address,
            rc_number: step3Legal.rc_number,
            nif_number: step3Legal.nif_number,
            nis_number: step3Legal.nis_number,
            ai_number: step3Legal.ai_number,
            tva_number: step3Legal.has_tva ? step3Legal.tva_number : undefined,
            director_name: step3Legal.director_name,
            director_id_card: step3Legal.director_id_card,
            director_role: step3Legal.director_role,
          } : {}),
          ...(entityType === "natural" && step3Natural ? {
            company_name: `${step1Data.first_name} ${step1Data.last_name}`,
            activity: step3Natural.activity,
            nif_number: step3Natural.nif_number,
            rc_number: step3Natural.rc_number,
          } : {}),
        },
      };

      localStorage.setItem(`nafida_pending_reg_${step1Data.email}`, JSON.stringify(pendingData));

      setRegStep("done");
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في إنشاء الحساب", description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetRegister = () => {
    setRegStep(1);
    setEntityType(null);
    setStep1Data(null);
    setStep3Legal(null);
    setStep3Natural(null);
    form1.reset();
    formLegal.reset();
    formNatural.reset();
    form4.reset();
  };

  const switchToSignUp = () => { resetRegister(); setIsSignUp(true); };
  const switchToLogin  = () => { resetRegister(); setIsSignUp(false); };

  if (loading) return null;
  if (user) return <Redirect to="/" />;

  const hasTva = formLegal.watch("has_tva");

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[600px]">

        {/* ── Left brand panel ── */}
        <div className="md:w-2/5 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-10 text-white flex flex-col justify-center items-center text-center flex-shrink-0">
          <div className="bg-white/10 p-4 rounded-2xl inline-block mb-6">
            <i className="fas fa-window-restore text-5xl text-orange-400" />
          </div>
          <h1 className="text-4xl font-bold mb-4">نافذة بيز</h1>
          <p className="text-slate-300 text-base leading-relaxed mb-8">
            تسييرك الجبائي والاجتماعي في الجزائر أصبح أسهل.<br />
            أتمتة ذكية وسلسة للضرائب G50 والمزيد.
          </p>
          {!isSignUp && (
            <button
              type="button"
              onClick={switchToSignUp}
              className="border-2 border-orange-500 text-orange-400 px-8 py-2 rounded-full hover:bg-orange-500 hover:text-white transition-all font-bold"
              data-testid="button-start-free"
            >
              ابدأ تجربتك المجانية
            </button>
          )}
        </div>

        {/* ── Right form panel ── */}
        <div className="flex-1 flex flex-col overflow-y-auto max-h-screen">
          <div className="p-8 md:p-10 flex-1">

            {/* ════ LOGIN ════ */}
            {!isSignUp && (
              <>
                <h2 className="text-3xl font-bold text-slate-800 mb-1">تسجيل الدخول</h2>
                <p className="text-slate-500 mb-8 text-sm">مرحباً بك مجدداً في نافذة بيز</p>

                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField control={loginForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Input placeholder="البريد الإلكتروني" className="pl-10 py-6 rounded-xl bg-slate-50" data-testid="input-email" {...field} />
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={loginForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="relative">
                            <Input type={showPassword ? "text" : "password"} placeholder="كلمة المرور" className="pl-10 pr-10 py-6 rounded-xl bg-slate-50" data-testid="input-password" {...field} />
                            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full py-6 rounded-xl text-lg font-bold bg-orange-500 hover:bg-orange-600 text-white" disabled={loginForm.formState.isSubmitting} data-testid="button-submit">
                      {loginForm.formState.isSubmitting ? <i className="fas fa-spinner fa-spin" /> : "تسجيل الدخول"}
                    </Button>
                  </form>
                </Form>

                <p className="mt-8 text-center text-sm text-slate-600">
                  ليس لديك حساب؟{" "}
                  <button onClick={switchToSignUp} className="text-orange-500 font-bold hover:underline" data-testid="button-toggle-mode">
                    أنشئ حساباً جديداً الآن
                  </button>
                </p>
              </>
            )}

            {/* ════ REGISTER ════ */}
            {isSignUp && regStep !== "done" && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-2xl font-bold text-slate-800">إنشاء حساب جديد</h2>
                  {regStep !== 1 && (
                    <button
                      onClick={() => setRegStep(prev => (typeof prev === "number" ? Math.max(1, prev - 1) as RegStep : 1))}
                      className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
                    >
                      <ChevronRight className="w-4 h-4" /> رجوع
                    </button>
                  )}
                </div>

                <StepIndicator current={typeof regStep === "number" ? regStep : 4} />

                {/* ── Step 1: Account info ── */}
                {regStep === 1 && (
                  <Form {...form1}>
                    <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form1.control} name="first_name" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold text-slate-600">الاسم</FormLabel>
                            <FormControl><Input placeholder="أحمد" className="rounded-xl" data-testid="input-first-name" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form1.control} name="last_name" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-semibold text-slate-600">اللقب</FormLabel>
                            <FormControl><Input placeholder="بن علي" className="rounded-xl" data-testid="input-last-name" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form1.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">رقم الهاتف</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input placeholder="0555 12 34 56" className="pl-10 rounded-xl" data-testid="input-phone" {...field} />
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form1.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">البريد الإلكتروني</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input placeholder="ahmed@exemple.dz" className="pl-10 rounded-xl" data-testid="input-email" {...field} />
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form1.control} name="password" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">كلمة المرور</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input type={showPassword ? "text" : "password"} placeholder="8 أحرف على الأقل" className="pl-10 rounded-xl" {...field} />
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full py-5 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-2" data-testid="button-next-step">
                        التالي <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </form>
                  </Form>
                )}

                {/* ── Step 2: Entity type ── */}
                {regStep === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-500 mb-4">اختر طبيعة نشاطك التجاري</p>
                    <button
                      onClick={() => onStep2("legal")}
                      className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-right group"
                      data-testid="btn-entity-legal"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center flex-shrink-0 transition-colors">
                        <Building2 className="w-7 h-7 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-base">شخص معنوي</p>
                        <p className="text-sm text-slate-500 mt-0.5">شركة مسجلة (SARL، EURL، SPA، Startup...)</p>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-orange-500 transition-colors" />
                    </button>
                    <button
                      onClick={() => onStep2("natural")}
                      className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-right group"
                      data-testid="btn-entity-natural"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-green-100 group-hover:bg-green-200 flex items-center justify-center flex-shrink-0 transition-colors">
                        <User className="w-7 h-7 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 text-base">شخص طبيعي</p>
                        <p className="text-sm text-slate-500 mt-0.5">تاجر فرد أو ممارس نشاط تجاري باسمه الشخصي</p>
                      </div>
                      <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-orange-500 transition-colors" />
                    </button>
                  </div>
                )}

                {/* ── Step 3a: Legal entity ── */}
                {regStep === 3 && entityType === "legal" && (
                  <Form {...formLegal}>
                    <form onSubmit={formLegal.handleSubmit(onStep3Legal)} className="space-y-5">

                      {/* Company info */}
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">معلومات الشركة</p>
                        <div className="space-y-3">
                          <FormField control={formLegal.control} name="company_name" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">الاسم التجاري / Raison Sociale <span className="text-red-400">*</span></FormLabel>
                              <FormControl><Input placeholder="شركة البناء الجزائرية SARL" className="rounded-xl" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={formLegal.control} name="company_type" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">نوع الشركة <span className="text-red-400">*</span></FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر نوع الشركة" /></SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="SARL">SARL — شركة ذات مسؤولية محدودة</SelectItem>
                                  <SelectItem value="EURL">EURL — شركة ذات مسؤولية محدودة بشريك وحيد</SelectItem>
                                  <SelectItem value="SPA">SPA — شركة مساهمة</SelectItem>
                                  <SelectItem value="Startup">Startup — شركة ناشئة</SelectItem>
                                  <SelectItem value="SNC">SNC — شركة التضامن</SelectItem>
                                  <SelectItem value="SCS">SCS — شركة التوصية البسيطة</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={formLegal.control} name="company_email" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-semibold text-slate-600">البريد الإلكتروني</FormLabel>
                                <FormControl><Input placeholder="contact@societe.dz" className="rounded-xl" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={formLegal.control} name="company_phone" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-semibold text-slate-600">رقم الهاتف</FormLabel>
                                <FormControl><Input placeholder="023 XX XX XX" className="rounded-xl" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                          <FormField control={formLegal.control} name="address" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">عنوان الشركة <span className="text-red-400">*</span></FormLabel>
                              <FormControl><Input placeholder="12 شارع الاستقلال، الجزائر العاصمة" className="rounded-xl" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                      </div>

                      {/* Legal info */}
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">المعلومات القانونية</p>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField control={formLegal.control} name="rc_number" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">السجل التجاري RC</FormLabel>
                              <FormControl><Input placeholder="16/00-0000000B19" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={formLegal.control} name="nif_number" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">رقم التعريف الجبائي NIF</FormLabel>
                              <FormControl><Input placeholder="000000000000000" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={formLegal.control} name="nis_number" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">رقم التعريف الإحصائي NIS</FormLabel>
                              <FormControl><Input placeholder="0000000000000000000" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={formLegal.control} name="ai_number" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">رقم المادة AI</FormLabel>
                              <FormControl><Input placeholder="000000000" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        </div>
                        {/* TVA */}
                        <div
                          onClick={() => formLegal.setValue("has_tva", !hasTva)}
                          className={`mt-3 flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${hasTva ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${hasTva ? "bg-blue-500 border-blue-500" : "border-slate-300"}`}>
                            {hasTva && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="text-sm font-medium text-slate-700">الشركة خاضعة للرسم على القيمة المضافة (TVA)</span>
                        </div>
                        {hasTva && (
                          <FormField control={formLegal.control} name="tva_number" render={({ field }) => (
                            <FormItem className="mt-2">
                              <FormLabel className="text-xs font-semibold text-slate-600">رقم TVA</FormLabel>
                              <FormControl><Input placeholder="رقم تسجيل TVA" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                      </div>

                      {/* Manager info */}
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">معلومات المسؤول</p>
                        <div className="space-y-3">
                          <FormField control={formLegal.control} name="director_name" render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs font-semibold text-slate-600">اسم المدير / الممثل القانوني <span className="text-red-400">*</span></FormLabel>
                              <FormControl><Input placeholder="محمد بن علي" className="rounded-xl" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={formLegal.control} name="director_id_card" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-semibold text-slate-600">رقم بطاقة الهوية</FormLabel>
                                <FormControl><Input placeholder="000000000" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                            <FormField control={formLegal.control} name="director_role" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs font-semibold text-slate-600">الصفة داخل الشركة</FormLabel>
                                <FormControl><Input placeholder="مثال: مدير عام" className="rounded-xl" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />
                          </div>
                        </div>
                      </div>

                      <Button type="submit" className="w-full py-5 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-2">
                        التالي <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </form>
                  </Form>
                )}

                {/* ── Step 3b: Natural person ── */}
                {regStep === 3 && entityType === "natural" && (
                  <Form {...formNatural}>
                    <form onSubmit={formNatural.handleSubmit(onStep3Natural)} className="space-y-4">
                      <FormField control={formNatural.control} name="activity" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">النشاط التجاري <span className="text-red-400">*</span></FormLabel>
                          <FormControl><Input placeholder="مثال: تجارة التجزئة، مقاول بناء..." className="rounded-xl" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={formNatural.control} name="nif_number" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">رقم التعريف الجبائي NIF <span className="text-slate-400 font-normal">(اختياري)</span></FormLabel>
                          <FormControl><Input placeholder="000000000000000" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={formNatural.control} name="rc_number" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-slate-600">رقم السجل التجاري RC <span className="text-slate-400 font-normal">(إن كنت تاجراً)</span></FormLabel>
                          <FormControl><Input placeholder="16/00-0000000B19" className="rounded-xl font-mono text-sm" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <Button type="submit" className="w-full py-5 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-2">
                        التالي <ChevronLeft className="w-4 h-4" />
                      </Button>
                    </form>
                  </Form>
                )}

                {/* ── Step 4: Tax regime ── */}
                {regStep === 4 && (
                  <Form {...form4}>
                    <form onSubmit={form4.handleSubmit(onStep4)} className="space-y-4">
                      <p className="text-sm text-slate-500 mb-2">اختر النظام الجبائي المناسب لنشاطك</p>

                      {[
                        { value: "IFU", label: "IFU — الضريبة الجزافية الوحيدة", desc: "للمؤسسات التي لا يتجاوز رقم أعمالها 8 مليون دج", color: "blue" },
                        { value: "Real", label: "النظام الحقيقي", desc: "للشركات الكبيرة وفق محاسبة كاملة", color: "purple" },
                        { value: "RSI", label: "RSI — النظام المبسط", desc: "نظام وسيط بين IFU والنظام الحقيقي", color: "teal" },
                      ].map(regime => {
                        const selected = form4.watch("tax_regime") === regime.value;
                        const colorMap: Record<string, string> = {
                          blue: "border-blue-400 bg-blue-50",
                          purple: "border-purple-400 bg-purple-50",
                          teal: "border-teal-400 bg-teal-50",
                        };
                        return (
                          <button
                            key={regime.value}
                            type="button"
                            onClick={() => form4.setValue("tax_regime", regime.value)}
                            className={`w-full text-right p-4 rounded-2xl border-2 transition-all ${selected ? colorMap[regime.color] : "border-slate-200 hover:border-slate-300"}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold text-slate-800 text-sm">{regime.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{regime.desc}</p>
                              </div>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-3 ${selected ? "bg-orange-500 border-orange-500" : "border-slate-300"}`}>
                                {selected && <Check className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      {form4.watch("tax_regime") === "IFU" && (
                        <div
                          onClick={() => form4.setValue("has_startup_label", !form4.watch("has_startup_label"))}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${form4.watch("has_startup_label") ? "border-green-400 bg-green-50" : "border-slate-200 hover:border-green-300"}`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${form4.watch("has_startup_label") ? "bg-green-500 border-green-500" : "border-slate-300"}`}>
                            {form4.watch("has_startup_label") && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                              <ShieldCheck className="w-4 h-4 text-green-600" /> شركة ناشئة حاصلة على Label
                            </p>
                            <p className="text-xs text-slate-500">معفاة من IFU لعدة سنوات وفقاً للقانون</p>
                          </div>
                        </div>
                      )}

                      {form4.formState.errors.tax_regime && (
                        <p className="text-xs text-red-500">{form4.formState.errors.tax_regime.message}</p>
                      )}

                      <Button type="submit" className="w-full py-5 rounded-xl font-bold bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center gap-2" disabled={isSubmitting}>
                        {isSubmitting ? <i className="fas fa-spinner fa-spin" /> : <><Briefcase className="w-4 h-4" /> إنشاء الحساب</>}
                      </Button>
                    </form>
                  </Form>
                )}

                <p className="mt-6 text-center text-sm text-slate-600">
                  لديك حساب بالفعل؟{" "}
                  <button onClick={switchToLogin} className="text-orange-500 font-bold hover:underline">
                    سجل الدخول
                  </button>
                </p>
              </>
            )}

            {/* ════ DONE: Email confirmation screen ════ */}
            {isSignUp && regStep === "done" && (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center gap-6">
                <div className="w-24 h-24 rounded-full bg-orange-100 flex items-center justify-center">
                  <Mail className="w-12 h-12 text-orange-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">تحقق من بريدك الإلكتروني</h2>
                  <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
                    أرسلنا رابط تأكيد إلى <strong className="text-slate-700">{step1Data?.email}</strong>.
                    <br />انقر على الرابط لتفعيل حسابك وإتمام إعداد نشاطك التجاري تلقائياً.
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-sm text-slate-600 w-full max-w-sm text-right space-y-2">
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 flex-shrink-0" /> بيانات حسابك محفوظة</p>
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 flex-shrink-0" /> بيانات نشاطك التجاري محفوظة</p>
                  <p className="flex items-center gap-2"><Check className="w-4 h-4 text-orange-400 flex-shrink-0" /> في انتظار تأكيد البريد الإلكتروني</p>
                </div>
                <button onClick={switchToLogin} className="text-sm text-slate-500 hover:text-slate-700 underline">
                  العودة إلى تسجيل الدخول
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
