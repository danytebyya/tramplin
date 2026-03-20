import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { registerRequest, useAuthStore } from "../../features/auth";
import { Button, Card, Checkbox, Container, Input, Radio } from "../../shared/ui";
import "./auth.css";

const registerSchema = z
  .object({
    role: z.enum(["applicant", "employer"]),
    displayName: z.string().min(2, "Enter your name"),
    email: z.string().email("Invalid email"),
    password: z.string().min(8, "Minimum 8 characters"),
    confirmPassword: z.string().min(8, "Minimum 8 characters"),
    acceptTerms: z.boolean().refine((value) => value, "Please accept terms"),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords must match",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;
type RegisterSuccessResponse = { data?: { access_token?: string } };

export function AuthPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "applicant",
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const selectedRole = watch("role");

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (data: RegisterSuccessResponse) => {
      const accessToken = data?.data?.access_token;
      if (accessToken) {
        setSession(accessToken, selectedRole);
      }
      navigate(selectedRole === "employer" ? "/dashboard/employer" : "/dashboard/applicant");
    },
    onError: () => {
      setApiError("Registration failed. Please try again.");
    },
  });

  const onSubmit = (values: RegisterFormValues) => {
    setApiError(null);
    registerMutation.mutate({
      email: values.email,
      password: values.password,
      display_name: values.displayName,
      role: values.role,
    });
  };

  return (
    <main className="auth-page">
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__media">
          <div className="auth-page__illustration" />
          <div className="auth-page__illustration-note">Career visual placeholder</div>
        </section>

        <section className="auth-page__form-side">
          <Card className="auth-card">
            <h1 className="auth-card__title">Registration</h1>
            <p className="auth-card__hint">
              Already have an account? <Link to="/login">Login</Link>
            </p>

            <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
              <div className="auth-form__role-group">
                <label className="auth-form__role-option">
                  <Radio
                    checked={selectedRole === "employer"}
                    onChange={() => setValue("role", "employer", { shouldValidate: true })}
                  />
                  <span>Employer</span>
                </label>

                <label className="auth-form__role-option">
                  <Radio
                    checked={selectedRole === "applicant"}
                    onChange={() => setValue("role", "applicant", { shouldValidate: true })}
                  />
                  <span>Applicant</span>
                </label>
              </div>

              <label className="auth-form__field">
                <span className="auth-form__label">Name</span>
                <Input placeholder="Your full name" {...register("displayName")} />
                {errors.displayName && <span className="auth-form__error">{errors.displayName.message}</span>}
              </label>

              <label className="auth-form__field">
                <span className="auth-form__label">Email</span>
                <Input placeholder="name@company.com" autoComplete="email" {...register("email")} />
                {errors.email && <span className="auth-form__error">{errors.email.message}</span>}
              </label>

              <label className="auth-form__field">
                <span className="auth-form__label">Password</span>
                <Input type="password" autoComplete="new-password" {...register("password")} />
                {errors.password && <span className="auth-form__error">{errors.password.message}</span>}
              </label>

              <label className="auth-form__field">
                <span className="auth-form__label">Confirm password</span>
                <Input type="password" autoComplete="new-password" {...register("confirmPassword")} />
                {errors.confirmPassword && <span className="auth-form__error">{errors.confirmPassword.message}</span>}
              </label>

              <label className="auth-form__terms">
                <Checkbox {...register("acceptTerms")} />
                <span>
                  I accept <a href="#">terms and conditions</a>
                </span>
              </label>
              {errors.acceptTerms && <span className="auth-form__error">{errors.acceptTerms.message}</span>}
              {apiError && <span className="auth-form__error">{apiError}</span>}

              <Button type="submit" fullWidth disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Registering..." : "Register"}
              </Button>
            </form>
          </Card>
        </section>
      </Container>
    </main>
  );
}
