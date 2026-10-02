"use client";

import { useEffect, useState, useCallback } from "react";
import Script from "next/script";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import {
  fetchSubscriptionStatus,
  getCachedSubscriptionStatus,
  createCheckoutOrder,
  verifyPaymentAndUpgrade,
  cancelSubscription,
  SubscriptionStatusResponse,
} from "@/lib/services/subscription";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: any;
  }
}

export default function SubscriptionPage() {
  const [data, setData] = useState<SubscriptionStatusResponse | null>(() => getCachedSubscriptionStatus());
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [, setRazorpayReady] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const res = await fetchSubscriptionStatus(supabase);
    if (res.error) {
      setError(res.error.message);
    } else {
      setData(res.data);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();
    fetchSubscriptionStatus(supabase).then((res) => {
      if (!isMounted) return;
      if (res.error) {
        setError(res.error.message);
      } else {
        setData(res.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpgrade = async () => {
    setUpgrading(true);
    setError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const orderRes = await createCheckoutOrder(supabase, "premium");

    if (orderRes.error || !orderRes.data) {
      setError(orderRes.error?.message || "Failed to initialize upgrade checkout.");
      setUpgrading(false);
      return;
    }

    const orderData = orderRes.data;

    // If Razorpay SDK is loaded in browser
    if (typeof window !== "undefined" && window.Razorpay) {
      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "CarePath Health Intelligence",
        description: "CarePath Premium Subscription (Sandbox)",
        order_id: orderData.order_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async function (response: any) {
          const verifyRes = await verifyPaymentAndUpgrade(supabase, {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            plan_id: "premium",
          });

          if (verifyRes.error || !verifyRes.data?.success) {
            setError(verifyRes.error?.message || "Cryptographic payment verification failed.");
          } else {
            setSuccessMessage("Premium Plan unlocked! Your AI quota is now 50 analyses/month.");
            loadData();
          }
          setUpgrading(false);
        },
        prefill: {
          name: orderData.patient_name,
          email: orderData.patient_email || "patient@example.com",
        },
        theme: {
          color: "#0d9488",
        },
        modal: {
          ondismiss: function () {
            setUpgrading(false);
          },
        },
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (err) {
        console.error("Razorpay popup error:", err);
        // Fallback to sandbox test simulation if modal fails
        triggerSandboxDirectSimulation(orderData.order_id);
      }
    } else {
      // Razorpay script not loaded; use sandbox simulation endpoint
      triggerSandboxDirectSimulation(orderData.order_id);
    }
  };

  const triggerSandboxDirectSimulation = async (orderId: string) => {
    // Generate valid test signature using test secret representation for sandbox demonstration
    const supabase = createClient();
    const mockPaymentId = `pay_sand_${Date.now()}`;
    const mockSignature = `mock_sig_${orderId}_${mockPaymentId}`;

    const verifyRes = await verifyPaymentAndUpgrade(supabase, {
      razorpay_order_id: orderId,
      razorpay_payment_id: mockPaymentId,
      razorpay_signature: mockSignature,
      plan_id: "premium",
    });

    setUpgrading(false);
    if (verifyRes.error || !verifyRes.data?.success) {
      setError(verifyRes.error?.message || "Sandbox payment verification failed.");
    } else {
      setSuccessMessage("Premium Plan unlocked! Your AI quota is now 50 analyses/month.");
      loadData();
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        "Are you sure you want to cancel your Premium subscription? Your medical records, uploaded documents, and timeline will remain fully accessible."
      )
    ) {
      return;
    }

    setCancelling(true);
    setError(null);
    const supabase = createClient();
    const res = await cancelSubscription(supabase);
    setCancelling(false);

    if (res.error) {
      setError(res.error.message);
    } else {
      setSuccessMessage("Your subscription has been cancelled. Your existing health records remain safe.");
      loadData();
    }
  };

  const isPremium = data?.plan === "premium";

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onLoad={() => setRazorpayReady(true)}
      />

      <div className="min-h-screen bg-slate-50/50 pb-16 font-sans">
        {/* Navigation Bar */}
        <div className="border-b border-slate-200/80 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-teal-700 transition-colors"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back to Dashboard
            </Link>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">CarePath Healthcare Plans</span>
            </div>
          </div>
        </div>

        {/* Page Container */}
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-xs py-0.5">
              Transparent Healthcare Intelligence
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Patient Plans & Subscriptions
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every patient starts with free lifelong health storage. Upgrade to Premium for expanded AI clinical intelligence, deeper multimodal extraction, and extended family circles.
            </p>
          </div>

          {/* Feedback Banners */}
          {successMessage && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-900 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{successMessage}</span>
              </div>
              <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900">
                &times;
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
                &times;
              </button>
            </div>
          )}

          {/* Current Plan Status Card */}
          {data && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Subscription</span>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold text-slate-900 capitalize">{data.plan} Plan</h2>
                    {isPremium ? (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs">
                        <Sparkles className="h-3 w-3 mr-1 text-amber-600" />
                        Premium Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300 font-semibold text-xs">
                        Free Lifetime
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {isPremium
                      ? "Full clinical intelligence with 50 monthly AI document extractions."
                      : "Essential patient records, timeline, and 3 monthly AI document extractions."}
                  </p>
                </div>

                {isPremium && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50 self-start sm:self-auto"
                  >
                    {cancelling ? "Processing..." : "Cancel Subscription"}
                  </Button>
                )}
              </div>

              {/* Server-Side AI Usage Meter */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-teal-600" />
                    Monthly AI Analysis Quota
                  </span>
                  <span className="font-mono text-slate-600">
                    <strong className="text-slate-900">{data.ai_analyses_used}</strong> / {data.ai_analyses_limit} used
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      data.ai_analyses_used >= data.ai_analyses_limit
                        ? "bg-red-500"
                        : data.ai_analyses_used / data.ai_analyses_limit > 0.7
                        ? "bg-amber-500"
                        : "bg-teal-600"
                    }`}
                    style={{
                      width: `${Math.min(100, (data.ai_analyses_used / data.ai_analyses_limit) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Resets monthly on server-enforced billing cycle. Unused analyses do not roll over.
                </p>
              </div>
            </div>
          )}

          {/* Pricing Tiers Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free Tier */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">CarePath Free</h3>
                    <p className="text-xs text-slate-500">Core personal healthcare vault</p>
                  </div>
                  <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700">
                    Essential
                  </Badge>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">₹0</span>
                  <span className="text-xs text-slate-500">/ forever</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-600 pt-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Private Supabase Document Vault</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Unified Health Timeline & Calendar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Temporary QR Doctor Access Sessions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>3 AI Document Analyses</strong> per month</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-400">
                    <XCircle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                    <span>Priority multimodal extraction</span>
                  </li>
                  <li className="flex items-start gap-2 text-slate-400">
                    <XCircle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                    <span>Multi-member family circles (up to 5)</span>
                  </li>
                </ul>
              </div>

              <div>
                {!isPremium ? (
                  <Button disabled variant="outline" className="w-full text-xs h-10 border-slate-300">
                    Current Active Plan
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="w-full text-xs h-10 text-slate-600"
                  >
                    Downgrade to Free
                  </Button>
                )}
              </div>
            </div>

            {/* Premium Tier */}
            <div className="rounded-2xl border-2 border-teal-600 bg-white p-6 shadow-md space-y-6 flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-teal-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                Recommended
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">CarePath Premium</h3>
                    <p className="text-xs text-slate-500">Advanced clinical intelligence</p>
                  </div>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">₹199</span>
                  <span className="text-xs text-slate-500">/ month</span>
                </div>

                <ul className="space-y-2.5 text-xs text-slate-600 pt-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span><strong>50 AI Document Analyses</strong> per month</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Advanced Multimodal AI (PDFs & High-Res Scans)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Cross-document Information Mismatch Engine</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Family Health Circles (Up to 5 dependents)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Extended Care Calendar Projection Engine</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                    <span>Priority Doctor QR Session Capability</span>
                  </li>
                </ul>
              </div>

              <div>
                {isPremium ? (
                  <Button disabled className="w-full bg-teal-50 text-teal-700 border border-teal-200 text-xs h-10 font-semibold">
                    Current Active Plan
                  </Button>
                ) : (
                  <Button
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs h-10 font-semibold shadow-xs"
                  >
                    {upgrading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Initializing Sandbox Payment...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1.5 h-4 w-4" />
                        Upgrade to Premium (₹199/mo)
                      </>
                    )}
                  </Button>
                )}
                <p className="text-[10px] text-slate-400 text-center mt-2">
                  Sandbox Test Mode • Instant activation • Cancel anytime
                </p>
              </div>
            </div>
          </div>

          {/* Medical Data Ownership Guarantee */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <span>CarePath Patient Data Retention Guarantee</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              CarePath adheres strictly to patient ownership principles. If you ever cancel or pause your subscription, you will <strong>never lose access</strong> to your medical records, uploaded documents, health timeline, or doctor QR sharing. Subscription status only regulates monthly AI extraction volume.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
