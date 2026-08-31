"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { Button } from '@/components/ui/Button';
import NotificationBell from '@/components/client/admin/NotificationBell';
import { useEnquiries } from '@/components/client/admin/EnquiriesProvider';
import { useOrders } from '@/components/client/admin/OrdersProvider';
import { useConsultations } from '@/components/client/admin/ConsultationsProvider';
import {
  MdDashboard,
  MdInventory2,
  MdGroup,
  MdMenu,
  MdLogout,
  MdCategory,
  MdHistory,
  MdClose,
  MdOutlineBrandingWatermark,
  MdOutlineInsights,
  MdOutlineForum,
  MdOutlineShoppingBag,
  MdOutlineEventAvailable
} from 'react-icons/md';

const AVATAR_COLORS = [
  'bg-[#7A9268] text-white',
  'bg-[#2C3829] text-[#F5F0E8]',
  'bg-[#F5F0E8] text-[#2C3829]',
  'bg-[#EDE6D8] text-[#2C3829]',
  'bg-[#A8BC9A] text-[#2C3829]',
  'bg-[#D4DFD0] text-[#2C3829]',
  'bg-[#E8D5C4] text-[#2C3829]',
  'bg-[#C4856A] text-white',
  'bg-[#7A7068] text-white',
];

interface AdminNavProfile {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: string | null;
}

export default function AdminNavigation({
  initialProfile = null,
  initialUserId = null,
}: {
  initialProfile?: AdminNavProfile | null;
  initialUserId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { unreadCount: enquiryCount } = useEnquiries();
  const { newCount: orderCount } = useOrders();
  const { newCount: consultationCount } = useConsultations();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  // Identity comes from the server (props) — no getSession()/profile query on
  // mount. We only listen for sign-out to clear the UI.
  const [user, setUser] = useState<{ id: string } | null>(
    initialUserId ? { id: initialUserId } : null,
  );
  const [profile, setProfile] = useState<AdminNavProfile | null>(initialProfile);

  // Lock the page scroll while the mobile drawer is open (no scroll bleed).
  useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLogoutModalOpen(false);
    setIsMenuOpen(false);
    router.push('/login');
  };

  const getInitials = () => {
    if (!profile) return "A";
    const initials = `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase();
    return initials || "A";
  };

  const getAvatarColor = () => {
    if (!profile || !profile.first_name) return AVATAR_COLORS[0];
    const charCode = profile.first_name.charCodeAt(0) || 0;
    return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
  };

  const navLinks = [
    { href: "/admin", icon: <MdDashboard className="text-xl" />, label: "Dashboard" },
    { href: "/admin/analytics", icon: <MdOutlineInsights className="text-xl" />, label: "Analytics" },
    { href: "/admin/products", icon: <MdInventory2 className="text-xl" />, label: "Products" },
    { href: "/admin/categories", icon: <MdCategory className="text-xl" />, label: "Categories" },
    { href: "/admin/customers", icon: <MdGroup className="text-xl" />, label: "Customers" },
    { href: "/admin/branding", icon: <MdOutlineBrandingWatermark className="text-xl" />, label: "Branding" },
    { href: "/admin/activity", icon: <MdHistory className="text-xl" />, label: "Activity" },
    { href: "/admin/enquiries", icon: <MdOutlineForum className="text-xl" />, label: "Enquiries" },
    { href: "/admin/orders", icon: <MdOutlineShoppingBag className="text-xl" />, label: "Orders" },
    { href: "/admin/consultations", icon: <MdOutlineEventAvailable className="text-xl" />, label: "Consultations" },
  ];

  const badgeFor = (href: string) =>
    href === "/admin/enquiries"
      ? enquiryCount
      : href === "/admin/orders"
        ? orderCount
        : href === "/admin/consultations"
          ? consultationCount
          : 0;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[60] flex-col pt-6 pb-6 lg:pt-6 lg:pb-10 bg-[#2C3829] h-full w-72 shadow-xl hidden lg:flex">
        <div className="px-6 lg:px-10 mb-6 flex flex-col items-center">
          <div className="w-full flex justify-center mb-4">
            <Image
              src="/Ziea_Splash.png"
              alt="ZIEA Logo"
              width={80}
              height={80}
              className="w-20 h-auto object-contain"
              priority
            />
          </div>
          <p className="font-jost text-[#F5F0E8] font-medium tracking-wider">Admin Portal</p>
        </div>

        <nav className="flex-1 space-y-1 px-2 lg:px-6">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-4 py-3 flex items-center gap-4 transition-all duration-200 font-jost tracking-wide ${isActive
                    ? "bg-[#647b53] text-[#f9ffed] font-bold shadow-sm"
                    : "text-[#d6c3b3] hover:bg-[#d6c3b3]/10 hover:text-white"
                  }`}
              >
                {link.icon}
                <span>{link.label}</span>
                {badgeFor(link.href) > 0 && (
                  <span className="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#7A9268] text-white text-[11px] font-semibold flex items-center justify-center leading-none">
                    {badgeFor(link.href) > 99 ? "99+" : badgeFor(link.href)}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-2 lg:px-6 pt-6 border-t border-[#d6c3b3]/20">
          <div className="mb-6 px-4 flex items-center gap-4">
            {user && profile ? (
              <>
                <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-jost font-medium text-sm bg-[#7A9268] text-white ring-2 ring-white/15">
                  {getInitials()}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-jost font-medium text-sm text-[#F5F0E8] truncate">
                    {profile?.first_name} {profile?.last_name}
                  </span>
                  <span className="text-xs text-[#d6c3b3] truncate">
                    {profile?.role || 'Admin'}
                  </span>
                </div>
              </>
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse"></div>
            )}
          </div>

          <button
            onClick={() => setIsLogoutModalOpen(true)}
            className="text-[#d6c3b3] hover:bg-white/5 hover:text-white rounded-lg px-4 py-3 flex items-center gap-4 transition-all duration-200 w-full text-left font-jost tracking-wide"
          >
            <MdLogout className="text-xl" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-[#F5F0E8] shadow-sm lg:hidden border-b border-[#2C3829]/10">
        <Button variant="icon" onClick={() => setIsMenuOpen(true)} className="z-10 text-[#2C3829]">
          <MdMenu className="text-2xl" />
        </Button>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
          <Image
            src="/Ziea_Logo.png"
            alt="ZIEA Logo"
            width={300}
            height={150}
            className="h-16 w-auto object-contain scale-[1.8] pointer-events-auto"
            priority
          />
        </div>
        <div className="flex items-center gap-3 z-10">
          <NotificationBell variant="light" />
          {user && profile ? (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-jost font-medium text-xs shadow-sm ${getAvatarColor()}`}>
              {getInitials()}
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#2C3829]/20 animate-pulse"></div>
          )}
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="relative w-72 bg-[#2C3829] h-full shadow-2xl flex flex-col pt-4 overflow-y-auto hide-scrollbar transform transition-transform animate-in slide-in-from-left duration-300">
            <div className="px-6 flex justify-center mb-4 relative">
              <div className="flex flex-col items-center gap-2">
                <Image
                  src="/Ziea_Splash.png"
                  alt="ZIEA Logo"
                  width={64}
                  height={64}
                  className="w-16 h-auto object-contain"
                />
                <p className="font-jost text-[#F5F0E8] font-medium tracking-wider">Admin Portal</p>
              </div>
              <Button
                variant="icon"
                onClick={() => setIsMenuOpen(false)}
                className="text-[#F5F0E8] absolute top-0 right-4 hover:bg-white/10"
              >
                <MdClose className="text-2xl" />
              </Button>
            </div>

            <nav className="flex-1 space-y-1 px-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`rounded-lg px-4 py-2.5 flex items-center gap-4 transition-all duration-200 font-jost tracking-wide ${isActive
                        ? "bg-[#647b53] text-[#f9ffed] font-bold"
                        : "text-[#d6c3b3] hover:bg-white/5 hover:text-white"
                      }`}
                  >
                    {link.icon}
                    <span>{link.label}</span>
                    {badgeFor(link.href) > 0 && (
                      <span className="ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#7A9268] text-white text-[11px] font-semibold flex items-center justify-center leading-none">
                        {badgeFor(link.href) > 99 ? "99+" : badgeFor(link.href)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto px-2 pb-4 pt-4 border-t border-[#d6c3b3]/20">
              <div className="mb-4 px-4 flex items-center gap-4">
                {user && profile ? (
                  <>
                    <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-jost font-medium text-sm bg-[#7A9268] text-white ring-2 ring-white/15">
                      {getInitials()}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-jost font-medium text-sm text-[#F5F0E8] truncate">
                        {profile?.first_name} {profile?.last_name}
                      </span>
                      <span className="text-xs text-[#d6c3b3] truncate">
                        {profile?.email}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse"></div>
                )}
              </div>

              <button
                onClick={() => setIsLogoutModalOpen(true)}
                className="text-[#d6c3b3] hover:bg-white/5 hover:text-white rounded-lg px-4 py-2.5 flex items-center gap-4 transition-all duration-200 w-full text-left font-jost tracking-wide"
              >
                <MdLogout className="text-xl" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <ConfirmationModal
        isOpen={isLogoutModalOpen}
        title="Logout Confirmation"
        message="Are you sure you want to log out of the admin portal?"
        confirmLabel="Logout"
        icon={<MdLogout />}
        cancelLabel="Cancel"
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </>
  );
}
