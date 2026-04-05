import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageLayout } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const profileSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  company_name: z.string().optional(),
  nif: z.string().optional(),
  nis: z.string().optional(),
  rc: z.string().optional(),
  ai: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      company_name: "",
      nif: "",
      nis: "",
      rc: "",
      ai: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        phone: profile.phone || "",
        company_name: profile.company_name || "",
        nif: profile.nif || "",
        nis: profile.nis || "",
        rc: profile.rc || "",
        ai: profile.ai || "",
      });
    }
  }, [profile, form]);

  const onSubmit = (values: ProfileFormValues) => {
    const firstName = values.first_name?.trim() || "";
    const lastName = values.last_name?.trim() || "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    updateProfile.mutate(
      {
        data: {
          ...values,
          full_name: fullName || undefined,
        },
      },
      {
        onSuccess: (data) => {
          toast({ title: "تم الحفظ", description: "تم تحديث الملف الشخصي بنجاح" });
          queryClient.setQueryData(getGetProfileQueryKey(), data);
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "فشل في تحديث الملف الشخصي" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <PageLayout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded-xl"></div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">الملف الشخصي</h1>
          <p className="text-slate-500 mt-2">قم بتحديث معلوماتك الشخصية وبيانات شركتك</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/40 p-8 border border-slate-100 space-y-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <div>
                <h2 className="text-base font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">
                  المعلومات الشخصية
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="first_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم الأول</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-first-name" className="bg-slate-50" placeholder="أحمد" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="last_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>اللقب</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-last-name" className="bg-slate-50" placeholder="بن علي" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الهاتف</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-phone" className="bg-slate-50" placeholder="0555 12 34 56" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">
                  بيانات النشاط التجاري
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={form.control} name="company_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم الشركة / النشاط</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-company" className="bg-slate-50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="nif" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم التعريف الجبائي (NIF)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-nif" className="bg-slate-50 text-left font-mono" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="nis" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم التعريف الإحصائي (NIS)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-nis" className="bg-slate-50 text-left font-mono" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="rc" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم السجل التجاري (RC)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-rc" className="bg-slate-50 text-left font-mono" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="ai" render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم المادة (Article d'Imposition)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-ai" className="bg-slate-50 text-left font-mono" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-slate-100">
                <Button
                  type="submit"
                  className="bg-primary hover:bg-orange-600 text-white px-8 py-6 rounded-xl font-bold shadow-lg shadow-primary/20"
                  disabled={updateProfile.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfile.isPending ? <i className="fas fa-spinner fa-spin"></i> : "حفظ التغييرات"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </PageLayout>
  );
}
