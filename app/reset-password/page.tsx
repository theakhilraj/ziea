import ResetPasswordForm from '@/components/client/auth/ResetPasswordForm';
import { Metadata } from 'next';
import { getBranding } from '@/utils/branding.server';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: 'Create a new password for your ZIEA account.',
};

const FALLBACK_TL = "https://images.unsplash.com/photo-1600166898405-da9535204843?q=80&w=1974&auto=format&fit=crop";
const FALLBACK_BR = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1920&auto=format&fit=crop";

export default async function ResetPasswordPage() {
  const { auth } = await getBranding();
  const tl = auth.topLeft?.url ?? FALLBACK_TL;
  const br = auth.bottomRight?.url ?? FALLBACK_BR;
  return (
    <div className="min-h-screen bg-[#fff8f5] text-[#211a15] font-jost flex flex-col relative overflow-clip">
      {/* Background with noise texture */}
      <div className="fixed inset-0 bg-[#F5F0E8] z-[-2]"></div>
      
      {/* Optional: Add a subtle texture overlay if desired */}
      <div className="fixed inset-0 opacity-[0.015] mix-blend-multiply pointer-events-none z-[-1]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/clean-textile.png")' }}></div>

      {/* Visual Accents: Product Showcase Peeking (Top Left) */}
      <div className="fixed top-0 left-0 w-1/4 h-1/2 pointer-events-none hidden lg:block overflow-hidden z-0">
        <div className="relative w-full h-full -rotate-12 -translate-y-1/5 -translate-x-1/5">
          <div
            className="w-full h-full bg-cover bg-center rounded-3xl shadow-2xl"
            title="Editorial product shot of soft organic linen loungewear"
            style={{ backgroundImage: `url('${tl}')` }}
          ></div>
        </div>
      </div>

      {/* Visual Accents: Product Showcase Peeking (Bottom Right) */}
      <div className="fixed bottom-0 right-0 w-1/4 h-1/2 pointer-events-none hidden lg:block overflow-hidden z-0">
        <div className="relative w-full h-full rotate-12 translate-y-1/5 translate-x-1/5">
          <div
            className="w-full h-full bg-cover bg-center rounded-3xl shadow-2xl"
            title="Editorial product shot of comfortable sleepwear"
            style={{ backgroundImage: `url('${br}')` }}
          ></div>
        </div>
      </div>

      <main className="flex-grow flex flex-col items-center p-6 py-12 w-full relative z-10">
        <ResetPasswordForm />
      </main>
    </div>
  );
}
