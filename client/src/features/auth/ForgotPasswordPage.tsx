import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, KeyRound } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button, FieldError, Input, Label } from "@/components/ui/primitives";

const requestSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
});
const resetSchema = z
  .object({
    mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
    token: z.string().min(10, "Paste the reset token you received"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [mobile, setMobile] = useState("");
  const toast = useToast();
  const navigate = useNavigate();

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { mobile: "" },
  });
  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { mobile: "", token: "", newPassword: "", confirm: "" },
  });

  const onRequest = async (values: z.infer<typeof requestSchema>) => {
    try {
      await api.post("/auth/forgot-password", values);
      setMobile(values.mobile);
      resetForm.setValue("mobile", values.mobile);
      setStep("reset");
      toast.success("Reset token issued", "Check with your administrator or the server log.");
    } catch (err) {
      toast.error("Request failed", errorMessage(err));
    }
  };

  const onReset = async (values: z.infer<typeof resetSchema>) => {
    try {
      await api.post("/auth/reset-password", {
        mobile: values.mobile,
        token: values.token,
        newPassword: values.newPassword,
      });
      toast.success("Password reset", "Sign in with your new password.");
      navigate("/login");
    } catch (err) {
      toast.error("Reset failed", errorMessage(err));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <KeyRound className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "request"
              ? "Enter your registered mobile number to get a reset token"
              : `Enter the reset token for ${mobile}`}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
          {step === "request" ? (
            <form onSubmit={requestForm.handleSubmit(onRequest)} noValidate className="space-y-4">
              <div>
                <Label htmlFor="fp-mobile">Mobile Number</Label>
                <Input
                  id="fp-mobile"
                  type="tel"
                  maxLength={10}
                  placeholder="9000000001"
                  {...requestForm.register("mobile")}
                />
                <FieldError message={requestForm.formState.errors.mobile?.message} />
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={requestForm.formState.isSubmitting}
              >
                Send Reset Token
              </Button>
            </form>
          ) : (
            <form onSubmit={resetForm.handleSubmit(onReset)} noValidate className="space-y-4">
              <div>
                <Label htmlFor="token">Reset Token</Label>
                <Input id="token" placeholder="Paste token" {...resetForm.register("token")} />
                <FieldError message={resetForm.formState.errors.token?.message} />
              </div>
              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" type="password" {...resetForm.register("newPassword")} />
                <FieldError message={resetForm.formState.errors.newPassword?.message} />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input id="confirm" type="password" {...resetForm.register("confirm")} />
                <FieldError message={resetForm.formState.errors.confirm?.message} />
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={resetForm.formState.isSubmitting}
              >
                Reset Password
              </Button>
            </form>
          )}

          <Link
            to="/login"
            className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
