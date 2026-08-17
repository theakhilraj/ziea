"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import SearchBar from "./SearchBar";
import MobileSearchOverlay from "./MobileSearchOverlay";
import { createClient } from "@/utils/supabase/client";
import ConfirmationModal from "../../ui/ConfirmationModal";
import {
  MdSearch,
  MdOutlineFavoriteBorder,
  MdOutlineReceiptLong,
  MdOutlineShoppingBag,
  MdOutlinePerson,
  MdOutlineLogout,
  MdOutlineMenu,
  MdOutlineLogin,
  MdOutlinePersonAdd,
  MdHome,
  MdOutlineStyle,
  MdOutlineInfo,
  MdOutlineMail,
  MdOutlineInventory2,
  MdOutlineDesignServices
} from "react-icons/md";

const AVATAR_COLORS = [
  'bg-[#7A9268] text-white', // Sage Grove
  'bg-[#2C3829] text-[#F5F0E8]', // Deep Forest
  'bg-[#F5F0E8] text-[#2C3829]', // Warm Cream
  'bg-[#EDE6D8] text-[#2C3829]', // Linen Mist
  'bg-[#A8BC9A] text-[#2C3829]', // Sage Light
  'bg-[#D4DFD0] text-[#2C3829]', // Sage Pale
  'bg-[#E8D5C4] text-[#2C3829]', // Petal Blush
  'bg-[#C4856A] text-white', // Terracotta
  'bg-[#7A7068] text-white', // Warm Mist
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  // Memoize the client so its identity is stable across renders — otherwise every
  // effect that depends on `supabase` re-runs on each render (badge-count refetch storm).
  const supabase = useMemo(() => createClient(), []);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileUserOpen, setIsMobileUserOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    setIsMenuOpen(false);
    router.push(q ? `/collections?q=${encodeURIComponent(q)}` : "/collections");
  };

  useEffect(() => {
    // Click outside to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(event.target as Node)) {
        setIsMobileUserOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        // Fetch profile including role
        const { data: profileData } = await supabase
          .from('users')
          .select('first_name, last_name, email, role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileData) setProfile(profileData);
      }
    };

    fetchUser();

    // Listen to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        const { data: profileData } = await supabase
          .from('users')
          .select('first_name, last_name, email, role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileData) setProfile(profileData);
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router]);

  // Check role on navigation
  useEffect(() => {
    const checkRoleOnNavigation = async () => {
      if (user && profile) {
        const { data } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (data && data.role !== profile.role) {
          await supabase.auth.signOut();
          router.push('/login');
        }
      }
    };
    checkRoleOnNavigation();
  }, [pathname, user, profile, router, supabase]);

  // Track "last seen" (real browsing activity) for the admin Active-users metric.
  // Fire-and-forget on each authenticated navigation.
  useEffect(() => {
    if (user?.id) {
      supabase
        .from('users')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
    }
  }, [pathname, user?.id, supabase]);


  // Wishlist + cart badge counts. Refetched on navigation and whenever a mutation
  // elsewhere dispatches the `ziea:counts-changed` event, so badges stay live without
  // waiting for a page navigation.
  const userId = user?.id;
  useEffect(() => {
    let mounted = true;

    const fetchCounts = async () => {
      if (!userId) {
        if (mounted) {
          setWishlistCount(0);
          setCartCount(0);
        }
        return;
      }

      const [{ count: wCount }, { data: cartRows }] = await Promise.all([
        supabase
          .from('wishlist_items')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        supabase
          .from('cart_items')
          .select('quantity')
          .eq('user_id', userId),
      ]);

      if (!mounted) return;
      setWishlistCount(wCount ?? 0);
      setCartCount(
        (cartRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0),
      );
    };

    fetchCounts();

    const onChanged = () => fetchCounts();
    window.addEventListener('ziea:counts-changed', onChanged);

    return () => {
      mounted = false;
      window.removeEventListener('ziea:counts-changed', onChanged);
    };
  }, [pathname, userId, supabase]);


  // Animated close: play the slide-out, then unmount once it finishes.
  const closeMenu = () => {
    setIsMenuClosing(true);
    setTimeout(() => {
      setIsMenuOpen(false);
      setIsMenuClosing(false);
    }, 250);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsLogoutModalOpen(false);
    setIsMenuOpen(false);
    router.push('/login');
  };

  const getInitials = () => {
    if (!profile) return "U";
    return `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase();
  };

  const getAvatarColor = () => {
    if (!profile || !profile.first_name) return AVATAR_COLORS[0];
    const charCode = profile.first_name.charCodeAt(0) || 0;
    return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
  };

  const menuItems = [
    { icon: <MdHome className="text-2xl" />, label: "Home", href: "/" },
    { icon: <MdOutlineStyle className="text-2xl" />, label: "Collections", href: "/collections" },
    { icon: <MdOutlineReceiptLong className="text-2xl" />, label: "My Orders", href: "/orders" },
    { icon: <MdOutlineInfo className="text-2xl" />, label: "About Us", href: "/about-us" },
    { icon: <MdOutlineMail className="text-2xl" />, label: "Contact Us", href: "/contact-us" },
    { icon: <MdOutlineInventory2 className="text-2xl" />, label: "Bulk Orders", href: "/contact-us?type=collaboration" },
    { icon: <MdOutlineDesignServices className="text-2xl" />, label: "Customization Studio", href: "/contact-us?type=personal" },
  ];

  return (
    <>
      {/* Desktop Header */}
      <header className="hidden md:flex w-full fixed top-0 left-0 z-50 bg-background shadow-sm h-24">
        <div className="flex w-full h-full px-page items-center gap-4 lg:gap-6">
          {/* Logo — left end. Prominent natural height (no scale transform, which
              would overflow into and block clicks on the adjacent search bar). */}
          <Link href="/" aria-label="ZIEA home" className="shrink-0 flex items-center -ml-7 lg:-ml-9">
            <Image src="/Ziea_Logo.png" alt="ZIEA" width={400} height={250} sizes="280px" className="h-24 lg:h-28 w-auto object-contain scale-[1.35] origin-left" priority />
          </Link>

          {/* Search with live suggestions — next to the logo; grows to fill the row */}
          <SearchBar className="hidden lg:block flex-[1.6] min-w-0 ml-6 lg:ml-10" />

          {/* Primary nav */}
          <nav className="flex items-center gap-3 lg:gap-5 text-[11px] lg:text-[13px] font-semibold tracking-wide text-text/80">
            <Link href="/" className="hover:text-primary transition-colors whitespace-nowrap">HOME</Link>
            <Link href="/collections" className="hover:text-primary transition-colors whitespace-nowrap">COLLECTIONS</Link>
            <Link href="/about-us" className="hover:text-primary transition-colors whitespace-nowrap">ABOUT US</Link>
            <Link href="/contact-us" className="hover:text-primary transition-colors whitespace-nowrap">CONTACT US</Link>
            <Link href="/contact-us?type=collaboration" className="hover:text-primary transition-colors whitespace-nowrap">BULK ORDERS</Link>
            <Link href="/contact-us?type=personal" className="hover:text-primary transition-colors whitespace-nowrap">CUSTOMIZATION STUDIO</Link>
          </nav>

          {/* Right: icons + account */}
          <div className="flex-1 flex items-center justify-end gap-4 lg:gap-6">
            <div className="flex gap-4">
              <Link href="/wishlist" aria-label="Wishlist" className="relative text-text hover:text-primary transition-colors flex items-center">
                <MdOutlineFavoriteBorder className="text-2xl" />
                {user && wishlistCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[21px] h-[21px] px-1 rounded-full bg-[#7A9268] text-white text-[12px] font-semibold flex items-center justify-center leading-none">
                    {wishlistCount > 99 ? '99+' : wishlistCount}
                  </span>
                )}
              </Link>
              <Link href="/orders" aria-label="My Orders" className="text-text hover:text-primary transition-colors flex items-center">
                <MdOutlineReceiptLong className="text-2xl" />
              </Link>
              <Link href="/cart" aria-label="Cart" className="relative text-text hover:text-primary transition-colors flex items-center">
                <MdOutlineShoppingBag className="text-2xl" />
                {user && cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[21px] h-[21px] px-1 rounded-full bg-[#7A9268] text-white text-[12px] font-semibold flex items-center justify-center leading-none">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
            </div>

            <div className="flex items-center gap-2 text-xs lg:text-sm font-semibold tracking-wide text-text/80 border-l border-border/60 pl-4 lg:pl-6 whitespace-nowrap">
              {!user ? (
                <>
                  <Link href="/login" className="hover:text-primary transition-colors">LOGIN</Link>
                  <span className="text-border/60">|</span>
                  <Link href="/signup" className="hover:text-primary transition-colors">SIGN UP</Link>
                </>
              ) : !profile ? (
                <div className="w-10 h-10 rounded-full bg-muted/20 animate-pulse"></div>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-jost font-medium text-sm transition-transform hover:scale-105 ${getAvatarColor()}`}
                  >
                    {getInitials()}
                  </button>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-xl py-2 border border-black/5 animate-in fade-in slide-in-from-top-2">
                      <button
                        onClick={() => { setIsDropdownOpen(false); setIsLogoutModalOpen(true); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                      >
                        <MdOutlineLogout className="text-xl" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 w-full z-50 flex justify-between items-center px-page h-16 bg-background shadow-sm">
        <div className="flex items-center gap-1 z-10">
          <Button variant="icon" aria-label="Open menu" onClick={() => setIsMenuOpen(true)}>
            <MdOutlineMenu className="text-2xl" />
          </Button>
          <button
            aria-label="Search"
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center justify-center p-2 text-[#2C3829] active:scale-95 transition-transform"
          >
            <MdSearch className="text-[22px]" />
          </button>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
          <Link href="/" aria-label="ZIEA home" className="pointer-events-auto">
            <Image src="/Ziea_Logo.png" alt="ZIEA" width={300} height={150} sizes="200px" className="h-24 w-auto object-contain scale-[1.8]" />
          </Link>
        </div>
        <div className="flex gap-2 items-center z-10">
          <Link href="/wishlist" aria-label="Wishlist" className="relative flex items-center justify-center p-2 text-[#2C3829] active:scale-95 transition-transform">
            <MdOutlineFavoriteBorder className="text-[22px]" />
            {user && wishlistCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7A9268] text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                {wishlistCount > 99 ? '99+' : wishlistCount}
              </span>
            )}
          </Link>
          <Link href="/cart" aria-label="Cart" className="relative flex items-center justify-center p-2 text-[#2C3829] active:scale-95 transition-transform">
            <MdOutlineShoppingBag className="text-[22px]" />
            {user && cartCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7A9268] text-white text-[10px] font-semibold flex items-center justify-center leading-none">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
          {user && !profile ? (
            <div className="ml-1 flex items-center">
              <div className="w-8 h-8 rounded-full bg-muted/20 animate-pulse"></div>
            </div>
          ) : user && profile ? (
            <div className="relative ml-1 flex items-center" ref={mobileDropdownRef}>
              <button
                type="button"
                aria-label="Account menu"
                onClick={() => setIsMobileUserOpen((v) => !v)}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-jost font-medium text-xs shadow-sm active:scale-95 transition-transform ${getAvatarColor()}`}
              >
                {getInitials()}
              </button>

              {isMobileUserOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl shadow-xl py-2 border border-black/5 animate-in fade-in slide-in-from-top-2 z-[70]">
                  <button
                    onClick={() => { setIsMobileUserOpen(false); setIsLogoutModalOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                  >
                    <MdOutlineLogout className="text-xl" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {/* Slide-out Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] flex">
          <div
            className={`absolute inset-0 bg-black/50 backdrop-blur-sm duration-300 ${isMenuClosing ? "animate-out fade-out" : "animate-in fade-in"}`}
            onClick={closeMenu}
          />
          <div className={`relative w-72 bg-[#E8EDE5] h-full shadow-2xl flex flex-col px-4 pt-2 duration-300 ease-out ${isMenuClosing ? "animate-out slide-out-to-left fade-out" : "animate-in slide-in-from-left fade-in"}`}>
            <div className="flex items-center justify-center mb-4 border-b border-border/60">
              <Image src="/ZIEA_Splash2.png" alt="ZIEA" width={500} height={500} className="h-24 w-auto object-contain" />
            </div>

            <nav className="flex flex-col gap-1">
              {menuItems.map((item, index) => {
                const isActive = item.href === pathname;
                return (
                  <Link
                    key={index}
                    href={item.href || "#"}
                    onClick={closeMenu}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors ${
                      isActive
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-text hover:bg-primary/10 hover:text-primary"
                    }`}
                  >
                    {item.icon}
                    <span className="font-label-lg">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto pb-8 border-t border-border/50 pt-6">
              {!user ? (
                <nav className="flex flex-col gap-1">
                  <Link
                    href="/login"
                    onClick={closeMenu}
                    className="flex items-center gap-4 rounded-xl px-3 py-2.5 text-text/80 hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <MdOutlineLogin className="text-2xl" />
                    <span className="font-label-lg">Login</span>
                  </Link>
                  <Link
                    href="/signup"
                    onClick={closeMenu}
                    className="flex items-center gap-4 rounded-xl px-3 py-2.5 text-text/80 hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <MdOutlinePersonAdd className="text-2xl" />
                    <span className="font-label-lg">Sign Up</span>
                  </Link>
                </nav>
              ) : !profile ? (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setIsLogoutModalOpen(true)}
                    className="flex items-center gap-4 text-red-500 hover:text-red-600 transition-colors py-2"
                  >
                    <MdOutlineLogout className="text-2xl" />
                    <span className="font-label-lg">Logout</span>
                  </button>

                  <div className="flex items-center gap-3 bg-white/60 p-3 rounded-2xl">
                    <div className="w-12 h-12 rounded-full bg-muted/20 animate-pulse shrink-0"></div>
                    <div className="flex flex-col overflow-hidden w-full gap-2">
                      <div className="h-4 bg-muted/20 rounded animate-pulse w-3/4"></div>
                      <div className="h-3 bg-muted/20 rounded animate-pulse w-1/2"></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <button
                    onClick={() => setIsLogoutModalOpen(true)}
                    className="flex items-center gap-4 text-red-500 hover:text-red-600 transition-colors py-2"
                  >
                    <MdOutlineLogout className="text-2xl" />
                    <span className="font-label-lg">Logout</span>
                  </button>

                  <div className="flex items-center gap-3 bg-white/60 p-3 rounded-2xl">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-jost font-medium shrink-0 ${getAvatarColor()}`}>
                      {getInitials()}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-jost font-medium text-sm text-text truncate">
                        {profile?.first_name} {profile?.last_name}
                      </span>
                      <span className="text-xs text-on-surface-variant truncate">
                        {profile?.email || user.email}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile full-screen search */}
      <MobileSearchOverlay open={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Logout Confirmation Modal */}
      <ConfirmationModal
        isOpen={isLogoutModalOpen}
        title="Logout Confirmation"
        message="Are you sure you want to log out of your account?"
        confirmLabel="Logout"
        icon={<MdOutlineLogout />}
        cancelLabel="Cancel"
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </>
  );
}
