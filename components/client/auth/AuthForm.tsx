"use client";

import React, { useState } from 'react';
import { MdOutlineVisibility, MdOutlineVisibilityOff } from "react-icons/md";
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import Toast from '@/components/ui/Toast';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/utils/supabase/client';

interface AuthFormProps {
  initialMode: 'login' | 'signup';
}

export default function AuthForm({ initialMode }: AuthFormProps) {
  const router = useRouter();
  const mode = initialMode;
  const supabase = createClient();

  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // New States
  const [toast, setToast] = useState({ message: '', show: false, error: false });
  const [isLoading, setIsLoading] = useState(false);

  const showToast = (msg: string, isError = false) => {
    setToast({ message: msg, show: true, error: isError });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  // Validation state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const emailSchema = z.string().email("Please enter a valid email address");
  const phoneSchema = z.string().regex(/^\d+$/, "Phone number can only contain numbers").length(10, "Phone number must be exactly 10 digits");

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    const result = emailSchema.safeParse(e.target.value);
    if (!result.success && e.target.value.length > 0) setEmailError(result.error.issues[0].message);
    else setEmailError('');
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitizedValue = e.target.value.replace(/\D/g, '');
    setPhone(sanitizedValue);
    if (sanitizedValue.length > 0) {
      const result = phoneSchema.safeParse(sanitizedValue);
      if (!result.success) setPhoneError(result.error.issues[0].message);
      else setPhoneError('');
    } else {
      setPhoneError('');
    }
  };

  const handleToggle = (newMode: 'login' | 'signup') => {
    router.push(newMode === 'login' ? '/login' : '/signup', { scroll: false });
  };

  const handleGoogleAuth = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      showToast(error.message || "Failed to authenticate with Google", true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Resolve the role from the fresh, in-memory authenticated session (RLS
        // query is reliable here — the session is active the moment sign-in
        // resolves). We use it both for login logging AND the role-based redirect,
        // so admins never race the server cookie propagation into the customer page.
        let role: string | null = null;
        try {
          const { data: prof } = await supabase
            .from('users')
            .select('first_name, last_name, role')
            .eq('id', data.user.id)
            .maybeSingle();
          role = prof?.role ?? null;
          const roleLabel = role === 'Admin' ? 'Admin' : 'Customer';
          const name = `${prof?.first_name ?? ''} ${prof?.last_name ?? ''}`.trim();
          // Fire-and-forget: the login log + last-seen write must never delay the
          // redirect. The requests start now and finish in the background (SPA
          // navigation doesn't abort them).
          supabase.from('activity_logs').insert({
            user_id: data.user.id,
            type: `${roleLabel} Login`,
            description: `${roleLabel} ${name}`.trim() + ' logged in',
          }).then(() => { });
          supabase
            .from('users')
            .update({ last_login_at: new Date().toISOString() })
            .eq('id', data.user.id)
            .then(() => { });
        } catch {
          // Logging/role read must never block sign-in.
        }

        // Admins land in the portal; everyone else on the storefront. If the role
        // read failed for any reason, fall back to the server post-login gate.
        // Keep the button in its loading state through navigation (don't flip it
        // back to "Sign In" while the destination page is still loading).
        if (role === 'Admin') {
          router.push('/admin');
        } else if (role) {
          router.push('/');
        } else {
          router.push('/auth/post-login');
        }
        return;
      }
      setIsLoading(false);
    } catch (error: any) {
      // If user is not found or wrong password, it hits here
      showToast("You are not registered or invalid credentials. Please sign up first.", true);
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError || phoneError) return;
    if (password !== confirmPassword) {
      showToast("Passwords do not match.", true);
      return;
    }

    setIsLoading(true);
    try {
      // Split name for metadata
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/collections`,
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
          }
        }
      });

      if (error) throw error;

      if (data.user && data.user.identities && data.user.identities.length === 0) {
        showToast("An account with this email already exists.", true);
        return;
      }

      showToast("Account created successfully! Please check your email.");

      // Cleanup fields
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setConfirmPassword('');
      setEmailError('');
      setPhoneError('');

      // Optional: Auto redirect to login
      setTimeout(() => {
        router.push('/login');
      }, 2000);

    } catch (error: any) {
      showToast(error.message || "Failed to create account.", true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] bg-[#FDFAF6] rounded-3xl p-4 border border-border shadow-[0px_4px_32px_rgba(44,56,41,0.08)] relative z-10 my-auto mx-auto flex flex-col">
      {/* Brand Header */}
      <header className="flex flex-col items-center justify-center mb-6 shrink-0">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Image
            src="/ZIEA_Splash2.png"
            alt="ZIEA Clothing - Everyday Comfort"
            width={220}
            height={85}
            className="h-16 w-auto object-contain -mb-1"
            priority
          />
        </Link>
        <h1 className="font-cormorant text-3xl text-primary-dark tracking-wide">
          {mode === 'login' ? 'Welcome Back' : 'Join ZIEA'}
        </h1>
      </header>

      {/* Social Buttons */}
      <div className="mb-6">
        <Button variant="auth-social" type="button" onClick={handleGoogleAuth} disabled={isLoading}>
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
          </svg>
          Continue with Google
        </Button>
      </div>

      {/* Social Auth Divider */}
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-outline-variant/60"></div>
        </div>
        <div className="relative flex justify-center text-xs font-jost font-medium tracking-widest uppercase">
          <span className="bg-[#FDFAF6] px-4 text-outline/80">or use email</span>
        </div>
      </div>

      {/* Form Container */}
      <div className="relative">
        {mode === 'login' ? (
          <section key="login" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <form className="space-y-6" onSubmit={handleLogin}>
              <Input
                label="Email"
                placeholder="hello@example.com"
                required
                type="email"
                value={email}
                onChange={handleEmailChange}
                error={emailError}
              />
              <div className="group relative">
                <label className="block font-jost font-medium text-sm text-on-surface-variant mb-2 ml-1">Password</label>
                <Input
                  placeholder="••••••••"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-on-surface-variant/50 hover:text-primary transition-colors flex items-center"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <MdOutlineVisibilityOff className="text-xl" /> : <MdOutlineVisibility className="text-xl" />}
                    </button>
                  }
                />
                <div className="flex justify-end mt-2">
                  <Link href="/forgot-password" className="text-[15px] font-jost font-medium text-primary hover:opacity-80 hover:underline transition-opacity">Forgot?</Link>
                </div>
              </div>
              <div>
                <Button variant="auth-primary" type="submit" disabled={isLoading}>
                  {isLoading ? "Signing In..." : "Sign In"}
                </Button>
              </div>
              <div className="text-center">
                <p className="font-jost font-normal text-sm text-on-surface-variant">
                  Don't have an account?{' '}
                  <button type="button" onClick={() => handleToggle('signup')} className="text-primary font-medium hover:opacity-80 hover:underline transition-opacity">Sign Up</button>
                </p>
              </div>
            </form>
          </section>
        ) : (
          <section key="signup" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <form className="space-y-6" onSubmit={handleSignup}>
              <Input
                label="Full Name"
                placeholder="John Doe"
                required
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <Input
                label="Phone Number"
                placeholder="9876543210"
                required
                type="tel"
                maxLength={10}
                value={phone}
                onChange={handlePhoneChange}
                error={phoneError}
              />
              <Input
                label="Email"
                placeholder="sarah@example.com"
                required
                type="email"
                value={email}
                onChange={handleEmailChange}
                error={emailError}
              />
              <Input
                label="Password"
                placeholder="Create a password"
                required
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-on-surface-variant/50 hover:text-primary transition-colors flex items-center"
                  >
                    {showPassword ? <MdOutlineVisibilityOff className="text-xl" /> : <MdOutlineVisibility className="text-xl" />}
                  </button>
                }
              />
              <Input
                label="Confirm Password"
                placeholder="Repeat your password"
                required
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="text-on-surface-variant/50 hover:text-primary transition-colors flex items-center"
                  >
                    {showConfirmPassword ? <MdOutlineVisibilityOff className="text-xl" /> : <MdOutlineVisibility className="text-xl" />}
                  </button>
                }
              />
              <div>
                <Button variant="auth-primary" type="submit" disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Account"}
                </Button>
              </div>
              <div className="text-center">
                <p className="font-jost font-normal text-sm text-on-surface-variant">
                  Already a member?{' '}
                  <button type="button" onClick={() => handleToggle('login')} className="text-primary font-medium hover:opacity-80 hover:underline transition-opacity">Sign In</button>
                </p>
              </div>
            </form>
          </section>
        )}
      </div>

      {/* Toast Notification */}
      <Toast show={toast.show} message={toast.message} error={toast.error} />
    </div>
  );
}
