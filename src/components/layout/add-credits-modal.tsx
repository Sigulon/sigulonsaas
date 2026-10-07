"use client";

import { useState } from "react";
import { CreditCard, Check, Sparkles, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addCredits } from "@/lib/api/billing";

interface AddCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreditsAdded?: (newBalance: number) => void;
}

const PRESET_AMOUNTS = [500, 1000, 2500, 5000];

export function AddCreditsModal({ isOpen, onClose, onCreditsAdded }: AddCreditsModalProps) {
  const [amount, setAmount] = useState<number>(1000);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setCustomAmount("");
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "");
    setCustomAmount(val);
    if (val) {
      setAmount(parseInt(val, 10));
    }
  };

  const handleRecharge = async () => {
    if (amount <= 0) return;
    setIsProcessing(true);
    try {
      const res = await addCredits(amount);
      if (res.success) {
        setIsSuccess(true);
        if (onCreditsAdded) {
          onCreditsAdded(res.newBalance);
        }
        setTimeout(() => {
          setIsSuccess(false);
          setIsProcessing(false);
          onClose();
        }, 1200);
      }
    } catch {
      setIsProcessing(false);
    }
  };

  const minutesEstimate = Math.floor(amount / 0.85);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Add Voice Credits
              </h3>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Instantly replenish your calling balance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Preset Buttons */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-2">
              Select recharge amount
            </label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleSelectPreset(val)}
                  className={`py-2 px-3 text-sm font-semibold rounded-lg border transition-all text-center ${
                    amount === val && !customAmount
                      ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:border-blue-500 dark:text-blue-300 ring-2 ring-blue-500/20"
                      : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-300 hover:border-gray-300 dark:hover:border-neutral-700"
                  }`}
                >
                  ₹{val.toLocaleString("en-IN")}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1.5">
              Or enter custom amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">
                ₹
              </span>
              <input
                type="text"
                value={customAmount}
                onChange={handleCustomChange}
                placeholder="e.g. 3000"
                className="w-full pl-8 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Estimation Card */}
          <div className="p-3.5 rounded-lg bg-gray-50 dark:bg-neutral-800/60 border border-gray-100 dark:border-neutral-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-gray-600 dark:text-neutral-300">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Estimated talk time:</span>
            </div>
            <span className="font-mono font-semibold text-gray-900 dark:text-white">
              ~{minutesEstimate.toLocaleString()} minutes
            </span>
          </div>

          {/* Payment method preview */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-neutral-400 pt-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Secure UPI / Card checkout via Razorpay</span>
            </div>
            <span className="font-mono">GST invoice included</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-neutral-950 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRecharge}
            disabled={isProcessing || amount <= 0}
            className="min-w-28"
          >
            {isSuccess ? (
              <span className="flex items-center gap-1.5 text-white">
                <Check className="w-4 h-4" /> Added!
              </span>
            ) : isProcessing ? (
              "Processing..."
            ) : (
              `Pay ₹${amount.toLocaleString("en-IN")}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
