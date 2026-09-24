import { Metadata } from 'next';
import AuthForm from '../../components/client/auth/AuthForm';
import { getBranding } from '@/utils/branding.server';

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create an account to join the ZIEA community and experience the gentle embrace of everyday comfort.',
};

const FALLBACK_TL = "https://images.unsplash.com/photo-1600166898405-da9535204843?q=80&w=1974&auto=format&fit=crop";
const FALLBACK_BR = "https://lh3.googleusercontent.com/aida-public/AB6AXuAMNHOMo5hGIMHqqwO8AYqqs5F7D4BHcGA429bzA5xHF6H0hNbeLRQ3YUaTvOXmKk6Ej_943I4H-OBLAT_uRYALF0PjOlDP-uYcbf8WqzTJclD56SVqUjA74LPGbaMGA4zpnV3llIleqqr2UV3gbhKFgKIwRUT91dBYebmVMMISrDdvkZ8uJpeVePPWJgmfsC1_Ilj2Nb-WC9TFUj93F8ppaBp79zibAuInPjCyfvhojUqRtSYbCuI3UyOrABt42IQbDj08yU6r2Uk";

export default async function SignupPage() {
  const { auth } = await getBranding();
  const tl = auth.topLeft?.url ?? FALLBACK_TL;
  const br = auth.bottomRight?.url ?? FALLBACK_BR;

  return (
    <div className="min-h-screen bg-[#fff8f5] text-[#211a15] font-jost flex flex-col relative overflow-clip">

      {/* Decorative backgrounds */}
      <div className="absolute w-[500px] h-[500px] rounded-full blur-[40px] -z-10 bg-[radial-gradient(circle,rgba(76,98,61,0.04)_0%,rgba(255,248,245,0)_70%)] top-0 right-0 -translate-y-1/4 translate-x-1/4"></div>
      <div className="absolute w-[500px] h-[500px] rounded-full blur-[40px] -z-10 bg-[radial-gradient(circle,rgba(76,98,61,0.04)_0%,rgba(255,248,245,0)_70%)] bottom-0 left-0 translate-y-1/4 -translate-x-1/4"></div>

      <main className="flex-grow flex flex-col items-center px-page py-12 w-full">
        <AuthForm initialMode="signup" />
      </main>

      {/* Visual Accents: Product Showcase Peeking (Top Left) */}
      <div className="fixed top-0 left-0 w-1/4 h-1/2 pointer-events-none hidden lg:block overflow-hidden z-0">
        <div className="relative w-full h-full -rotate-12 -translate-y-1/5 -translate-x-1/5">
          <div
            className="w-full h-full bg-cover bg-center rounded-3xl shadow-2xl"
            style={{ backgroundImage: `url('${tl}')` }}
          ></div>
        </div>
      </div>

      {/* Visual Accents: Product Showcase Peeking (Bottom Right) */}
      <div className="fixed bottom-0 right-0 w-1/4 h-1/2 pointer-events-none hidden lg:block overflow-hidden z-0">
        <div className="relative w-full h-full rotate-12 translate-y-1/5 translate-x-1/5">
          <div
            className="w-full h-full bg-cover bg-center rounded-3xl shadow-2xl"
            title="Editorial product shot of soft organic linen loungewear"
            style={{ backgroundImage: `url('${br}')` }}
          ></div>
        </div>
      </div>
    </div>
  );
}
