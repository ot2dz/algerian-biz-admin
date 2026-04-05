import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/context/CompanyContext";
import { useUpdateProfile, useCreateCompany } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Building2, ChevronLeft, ChevronRight, Check, ShieldCheck } from "lucide-react";

const step1Schema = z.object({
  first_name: z.string().min(2, "الاسم الأول مطلوب"),
  last_name: z.string().min(2, "اللقب مطلوب"),
  phone: z.string().optional(),
});

const step2Schema = z.object({
  company_name: z.string().min(2, "اسم الشركة مطلوب"),
  nif_number: z.string().optional(),
  rc_number: z.string().optional(),
  tax_regime: z.string().optional(),
  has_startup_label: z.boolean().optional(),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  mode?: "onboarding" | "add-company";
}

export function OnboardingModal({ open, onClose, mode = "onboarding" }: OnboardingModalProps) {
  const [step, setStep] = useState(mode === "add-company" ? 2 : 1);
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { refetch } = useCompany();
  const updateProfile = useUpdateProfile();
  const createCompany = useCreateCompany();

  const form1 = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: { first_name: "", last_name: "", phone: "" },
  });

  const form2 = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: { company_name: "", nif_number: "", rc_number: "", tax_regime: "IFU", has_startup_label: false },
  });

  const handleStep1 = (values: Step1Values) => {
    setStep1Data(values);
    setStep(2);
  };

  const handleStep2 = async (values: Step2Values) => {
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      if (mode === "onboarding" && step1Data) {
        await updateProfile.mutateAsync({
          data: {
            first_name: step1Data.first_name,
            last_name: step1Data.last_name,
            phone: step1Data.phone,
            full_name: `${step1Data.first_name} ${step1Data.last_name}`,
          },
        });
      }

      await createCompany.mutateAsync({
        data: {
          company_name: values.company_name,
          nif_number: values.nif_number || undefined,
          rc_number: values.rc_number || undefined,
          tax_regime: values.tax_regime || undefined,
          has_startup_label: values.has_startup_label ?? false,
        },
      });

      await refetch();

      toast({
        title: mode === "onboarding" ? "تم إعداد حسابك بنجاح" : "تمت إضافة الشركة بنجاح",
        description: mode === "onboarding" ? "مرحباً بك في نافذة بيز!" : `تمت إضافة ${values.company_name}`,
      });

      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ غير متوقع",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form1.reset();
    form2.reset();
    setStep(mode === "add-company" ? 2 : 1);
    setStep1Data(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden" dir="rtl">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-white text-xl font-bold">
              {mode === "add-company" ? "إضافة شركة جديدة" : "مرحباً بك في نافذة بيز"}
            </DialogTitle>
          </DialogHeader>
          {mode === "onboarding" && (
            <div className="flex items-center gap-3 mt-4">
              <div className={`flex items-center gap-2 text-sm font-medium ${step >= 1 ? "text-orange-400" : "text-slate-500"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${step > 1 ? "bg-orange-500 border-orange-500" : step === 1 ? "border-orange-400 text-orange-400" : "border-slate-600"}`}>
                  {step > 1 ? <Check className="w-4 h-4 text-white" /> : <User className="w-3.5 h-3.5" />}
                </div>
                المعلومات الشخصية
              </div>
              <div className="flex-1 h-px bg-slate-700"></div>
              <div className={`flex items-center gap-2 text-sm font-medium ${step >= 2 ? "text-orange-400" : "text-slate-500"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${step === 2 ? "border-orange-400 text-orange-400" : "border-slate-600"}`}>
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                معلومات الشركة
              </div>
            </div>
          )}
        </div>

        <div className="p-6">
          {step === 1 && mode === "onboarding" && (
            <Form {...form1}>
              <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form1.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">الاسم الأول</FormLabel>
                        <FormControl>
                          <Input placeholder="أحمد" className="rounded-xl" data-testid="input-first-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form1.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">اللقب</FormLabel>
                        <FormControl>
                          <Input placeholder="بن علي" className="rounded-xl" data-testid="input-last-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form1.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">رقم الهاتف</FormLabel>
                      <FormControl>
                        <Input placeholder="0555 12 34 56" className="rounded-xl" data-testid="input-phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-5 font-bold" data-testid="button-next-step">
                  التالي
                  <ChevronLeft className="w-4 h-4 mr-2" />
                </Button>
              </form>
            </Form>
          )}

          {step === 2 && (
            <Form {...form2}>
              <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-4">
                <FormField
                  control={form2.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">اسم الشركة / النشاط التجاري</FormLabel>
                      <FormControl>
                        <Input placeholder="شركة البناء الجزائرية" className="rounded-xl" data-testid="input-company-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form2.control}
                    name="nif_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">رقم التعريف الجبائي (NIF)</FormLabel>
                        <FormControl>
                          <Input placeholder="123456789012345" className="rounded-xl" data-testid="input-nif" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form2.control}
                    name="rc_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-700">السجل التجاري (RC)</FormLabel>
                        <FormControl>
                          <Input placeholder="16/00-0000000" className="rounded-xl" data-testid="input-rc" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form2.control}
                  name="tax_regime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700">النظام الجبائي</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="rounded-xl" data-testid="select-tax-regime">
                            <SelectValue placeholder="اختر النظام الجبائي" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="IFU">IFU - الضريبة الجزافية الوحيدة</SelectItem>
                          <SelectItem value="Real">نظام حقيقي</SelectItem>
                          <SelectItem value="RSI">RSI - نظام مبسط</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Startup Label — shown when IFU is selected */}
                {form2.watch("tax_regime") === "IFU" && (
                  <FormField control={form2.control} name="has_startup_label" render={({ field }) => (
                    <FormItem>
                      <div
                        onClick={() => field.onChange(!field.value)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors select-none ${field.value ? "border-green-400 bg-green-50" : "border-slate-200 bg-white hover:border-green-300"}`}
                        data-testid="checkbox-startup-label"
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${field.value ? "bg-green-500 border-green-500" : "border-slate-300 bg-white"}`}>
                          {field.value && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className={`w-4 h-4 ${field.value ? "text-green-600" : "text-slate-400"}`} />
                            <span className="text-sm font-semibold text-slate-800">شركة ناشئة حاصلة على Label</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            الشركات الناشئة المعتمدة معفاة من IFU لعدة سنوات وفقاً للقانون الجزائري
                          </p>
                        </div>
                      </div>
                    </FormItem>
                  )} />
                )}

                <div className="flex gap-3 pt-2">
                  {mode === "onboarding" && (
                    <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 rounded-xl" data-testid="button-prev-step">
                      <ChevronRight className="w-4 h-4 ml-2" />
                      السابق
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-5 font-bold"
                    disabled={isSubmitting}
                    data-testid="button-submit-onboarding"
                  >
                    {isSubmitting ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : (
                      mode === "add-company" ? "إضافة الشركة" : "إنهاء الإعداد"
                    )}
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
