import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";

const schema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        toast({
          title: "تم إنشاء الحساب بنجاح",
          description: "يمكنك الآن تسجيل الدخول",
        });
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
        setLocation("/");
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ غير متوقع",
      });
    }
  };

  if (loading) return null;
  if (user) return <Redirect to="/" />;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[600px]">
        {/* Left panel: dark navy gradient with brand */}
        <div className="md:w-1/2 bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-12 text-white flex flex-col justify-center items-center text-center">
          <div className="bg-white/10 p-4 rounded-2xl inline-block mb-6">
            <i className="fas fa-window-restore text-5xl text-orange-400"></i>
          </div>
          <h1 className="text-4xl font-bold mb-4">نافذة بيز</h1>
          <p className="text-slate-300 text-lg leading-relaxed mb-8">
            تسييرك الجبائي والاجتماعي في الجزائر أصبح أسهل.<br />
            أتمتة ذكية وسلسة للضرائب G50 والمزيد.
          </p>
          <button 
            type="button" 
            className="border-2 border-orange-500 text-orange-400 px-8 py-2 rounded-full hover:bg-orange-500 hover:text-white transition-all font-bold"
            onClick={() => setIsSignUp(true)}
            data-testid="button-start-free"
          >
            ابدأ تجربتك المجانية
          </button>
        </div>
        {/* Right panel: login form */}
        <div className="md:w-1/2 p-8 md:p-16 flex flex-col justify-center">
          <h2 className="text-3xl font-bold text-slate-800 mb-2">
            {isSignUp ? "إنشاء حساب جديد" : "تسجيل الدخول إلى حسابك"}
          </h2>
          <p className="text-slate-500 mb-8">
            {isSignUp ? "مرحباً بك في نافذة بيز" : "مرحباً بك مجدداً في نافذة بيز"}
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="البريد الإلكتروني"
                          className="pl-10 pr-4 py-6 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary"
                          data-testid="input-email"
                          {...field}
                        />
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="كلمة المرور"
                          className="pl-10 pr-10 py-6 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-primary"
                          data-testid="input-password"
                          {...field}
                        />
                        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isSignUp && (
                <div className="flex items-center gap-2 mb-4">
                  <input type="checkbox" id="remember" className="rounded border-slate-300 text-primary focus:ring-primary" />
                  <label htmlFor="remember" className="text-sm text-slate-600">تذكرني</label>
                </div>
              )}

              <Button
                type="submit"
                className="w-full py-6 rounded-xl text-lg font-bold bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-lg shadow-orange-500/20"
                disabled={form.formState.isSubmitting}
                data-testid="button-submit"
              >
                {form.formState.isSubmitting ? (
                  <i className="fas fa-spinner fa-spin"></i>
                ) : (
                  isSignUp ? "إنشاء حساب" : "تسجيل الدخول"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-8 flex items-center gap-4">
            <div className="h-px bg-slate-200 flex-1"></div>
            <span className="text-sm text-slate-400 font-medium">
              أو {isSignUp ? "سجل" : "سجل الدخول"} عبر
            </span>
            <div className="h-px bg-slate-200 flex-1"></div>
          </div>

          <div className="mt-6 flex gap-4">
            <button className="flex-1 py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
              <i className="fab fa-google text-red-500 text-xl"></i>
              <span className="font-medium text-slate-600">Google</span>
            </button>
            <button className="flex-1 py-3 border border-slate-200 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors">
              <i className="fab fa-facebook text-blue-600 text-xl"></i>
              <span className="font-medium text-slate-600">Facebook</span>
            </button>
          </div>

          <div className="mt-8 text-center text-sm text-slate-600">
            {isSignUp ? "لديك حساب بالفعل؟" : "ليس لديك حساب؟"}{" "}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary font-bold hover:underline"
              data-testid="button-toggle-mode"
            >
              {isSignUp ? "سجل الدخول الآن" : "أنشئ حساباً جديداً الآن"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
