"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Eye,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import {
  ApplicationData,
  VerificationResult,
  BatchItem,
  emptyApplicationData,
  REQUIRED_GOVERNMENT_WARNING,
} from "@/lib/types";
import { resizeImageToDataUrl } from "@/lib/image";
import { cn, generateId, clone } from "@/lib/utils";

type LoadingStep = "idle" | "resize" | "upload" | "reading" | "comparing" | "done";

// === Sample label configurations (real images + corresponding application data + expected behavior) ===
const SAMPLE_CONFIGS = [
  {
    id: "perfect",
    name: "Perfect Match — Bourbon",
    description: "Clean photo, all fields exact, warning properly formatted in caps + bold.",
    imagePath: "/samples/perfect-bourbon.jpg",
    data: {
      brandName: "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      producer: "Old Tom Distillery, Bardstown, KY",
      countryOfOrigin: "United States",
      governmentWarning: REQUIRED_GOVERNMENT_WARNING,
    },
    expectedIssues: 0,
  },
  {
    id: "warning-case",
    name: "Warning — Title Case Error",
    description: "Header is 'Government Warning:' instead of all caps. Should be flagged strongly.",
    imagePath: "/samples/warning-titlecase.jpg",
    data: {
      brandName: "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      producer: "",
      countryOfOrigin: "",
      governmentWarning: REQUIRED_GOVERNMENT_WARNING,
    },
    expectedIssues: 1,
  },
  {
    id: "brand-nuance",
    name: "Brand Nuance — Casing & Possessive",
    description: "Label shows STONE'S THROW; application uses 'Stone's Throw'. Should be fuzzy match.",
    imagePath: "/samples/brand-nuance-stones-throw.jpg",
    data: {
      brandName: "Stone's Throw",
      classType: "Small Batch Bourbon Whiskey",
      alcoholContent: "46% Alc./Vol.",
      netContents: "750 mL",
      producer: "",
      countryOfOrigin: "",
      governmentWarning: REQUIRED_GOVERNMENT_WARNING,
    },
    expectedIssues: 0,
  },
  {
    id: "glare-angle",
    name: "Difficult Photo — Angle + Glare",
    description: "Real-world imperfect capture. Model should still extract most fields correctly.",
    imagePath: "/samples/difficult-angle-glare.jpg",
    data: {
      brandName: "HILL COUNTRY DISTILLERS",
      classType: "Texas Straight Rye Whiskey",
      alcoholContent: "47% Alc./Vol.",
      netContents: "750 mL",
      producer: "",
      countryOfOrigin: "",
      governmentWarning: REQUIRED_GOVERNMENT_WARNING,
    },
    expectedIssues: 0,
  },
  {
    id: "wrong-abv",
    name: "Mismatch — Wrong ABV on Label",
    description: "Label shows 40% but application says 45%. Clear mismatch on alcohol content.",
    imagePath: "/samples/wrong-abv.jpg",
    data: {
      brandName: "OLD TOM DISTILLERY",
      classType: "Kentucky Straight Bourbon Whiskey",
      alcoholContent: "45% Alc./Vol. (90 Proof)",
      netContents: "750 mL",
      producer: "",
      countryOfOrigin: "",
      governmentWarning: REQUIRED_GOVERNMENT_WARNING,
    },
    expectedIssues: 1,
  },
  {
    id: "no-apostrophe",
    name: "Brand Nuance — Missing Apostrophe",
    description: "Label 'STONE THROW' vs submitted 'Stone's Throw'. Should still be understood as same.",
    imagePath: "/samples/brand-nuance-no-apostrophe.jpg",
    data: {
      brandName: "Stone's Throw",
      classType: "Small Batch Bourbon Whiskey",
      alcoholContent: "44% Alc./Vol. (88 Proof)",
      netContents: "1.75 L",
      producer: "",
      countryOfOrigin: "",
      governmentWarning: REQUIRED_GOVERNMENT_WARNING,
    },
    expectedIssues: 0,
  },
];

async function publicImageToDataUrl(path: string): Promise<string> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

const LOADING_STEPS = [
  { key: "resize", label: "Preparing image (client-side resize for speed)" },
  { key: "upload", label: "Sending to verification service" },
  { key: "reading", label: "AI reading the label (vision model)" },
  { key: "comparing", label: "Comparing against application data" },
];

export default function TTBLabelVerifier() {
  // === Single verification state ===
  const [appData, setAppData] = useState<ApplicationData>(clone(emptyApplicationData));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null); // object URL for display
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null); // resized data url for API

  const [isVerifying, setIsVerifying] = useState(false);
  const [currentLoadingStep, setCurrentLoadingStep] = useState<LoadingStep>("idle");
  const [result, setResult] = useState<VerificationResult | null>(null);

  const [showLightbox, setShowLightbox] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Batch tab (limited to 5)
  const MAX_BATCH = 5;
  const [activeTab, setActiveTab] = useState<'single' | 'batch'>('single');
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchTemplate, setBatchTemplate] = useState<ApplicationData>(clone(emptyApplicationData));
  const [isBatchVerifying, setIsBatchVerifying] = useState(false);
  const [expandedBatchItemIds, setExpandedBatchItemIds] = useState<Set<string>>(new Set());

  // === Helpers ===
  const resetSingle = useCallback(() => {
    setAppData(clone(emptyApplicationData));
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setImageDataUrl(null);
    setResult(null);
    setIsVerifying(false);
    setCurrentLoadingStep("idle");
  }, [imagePreview]);

  const loadSample = async (sample: (typeof SAMPLE_CONFIGS)[number], autoVerify: boolean) => {
    // Populate form
    setAppData(clone(sample.data as ApplicationData));
    setResult(null);

    // Load the public image into preview + dataUrl
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    // Create an object URL for nice immediate display
    const preview = sample.imagePath; // we can use the path directly for <img>
    setImagePreview(preview); // works because it's under public
    setImageFile(null); // we don't have the original File but don't need it

    // Convert the public image to a data URL so the API receives pixels (not just a path the server may not have in context of user upload simulation)
    const dataUrl = await publicImageToDataUrl(sample.imagePath);
    // Optional client resize for consistency with real uploads
    // For demo we can use directly or resize. Using directly is fine and fast.
    setImageDataUrl(dataUrl);

    toast.success(`Loaded sample: ${sample.name}`);

    if (autoVerify) {
      // Slight delay so state settles and UI updates
      setTimeout(() => {
        // We need to call runVerification but it reads from closure state.
        // Trigger by simulating the click path — easiest is to call a version or just set and invoke after paint.
        // Since imageDataUrl is now set, we can directly invoke the logic.
        // For simplicity, call the fetch directly here with the fresh data.
        runVerificationWithData(dataUrl, sample.data as ApplicationData);
      }, 60);
    }
  };

  // Load a demo batch of 5 identical "perfect" photos for the Batch Example section
  const loadBatchExample = async (autoVerify: boolean) => {
    const perfectSample = SAMPLE_CONFIGS[0];
    const imagePath = perfectSample.imagePath;
    const dataUrl = await publicImageToDataUrl(imagePath);
    const templateData = clone(perfectSample.data as ApplicationData);

    const items: BatchItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: generateId(),
      file: null,
      fileName: `perfect-bourbon-batch-${i + 1}.jpg`,
      previewUrl: imagePath,
      dataUrl,
      data: templateData,
      status: "idle" as const,
    }));

    setBatchItems(items);

    if (autoVerify) {
      // Perform verification live for the demo batch (reuses the same API call)
      setIsBatchVerifying(true);
      const updated = [...items];
      for (let i = 0; i < updated.length; i++) {
        updated[i] = { ...updated[i], status: "processing" as const };
        setBatchItems([...updated]);
        try {
          const res = await fetch("/api/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: updated[i].dataUrl, data: updated[i].data }),
          });
          const json = await res.json();
          if (!res.ok || json.error) throw new Error(json.error);
          updated[i] = { ...updated[i], result: json.result, status: "done" as const };
        } catch (e: any) {
          updated[i] = { ...updated[i], status: "error" as const, error: e.message || "Failed" };
        }
        setBatchItems([...updated]);
        await new Promise((r) => setTimeout(r, 200));
      }
      setIsBatchVerifying(false);
      toast.success("Batch example verified (all clean)");
    } else {
      toast.success("Batch example loaded (5 identical clean photos)");
    }
  };

  // Standalone runner so we can auto-verify from sample without depending on the latest render closure
  const runVerificationWithData = async (dataUrl: string, data: ApplicationData) => {
    setIsVerifying(true);
    setResult(null);
    setCurrentLoadingStep("resize");

    const stepSequence: LoadingStep[] = ["resize", "upload", "reading", "comparing"];
    let stepIndex = 0;
    const advance = () => { if (stepIndex < stepSequence.length - 1) { stepIndex++; setCurrentLoadingStep(stepSequence[stepIndex]); } };
    const timer = setInterval(advance, 320);  // slightly faster perceived steps for snappier feel

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, data }),
      });
      clearInterval(timer);
      setCurrentLoadingStep("done");

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Verification failed");

      const verification: VerificationResult = json.result;
      setResult(verification);

      const msg = verification.overallStatus === "pass" ? "All fields look good" : `${verification.issuesCount} issue${verification.issuesCount === 1 ? "" : "s"} found`;
      toast[verification.overallStatus === "pass" ? "success" : "warning"](msg);
    } catch (e: any) {
      clearInterval(timer);
      toast.error("Auto-verify failed", { description: e.message });
    } finally {
      setIsVerifying(false);
      setTimeout(() => setCurrentLoadingStep("idle"), 500);
    }
  };

  const updateField = (field: keyof ApplicationData, value: string) => {
    setAppData((prev) => ({ ...prev, [field]: value }));
    // Clear previous result when user edits data so they know to re-verify
    if (result) setResult(null);
  };

  const useStandardWarning = () => {
    updateField("governmentWarning", REQUIRED_GOVERNMENT_WARNING);
    toast.success("Standard Government Warning restored");
  };

  // Batch handlers (limited, reuses single engine)
  const updateBatchTemplate = (field: keyof ApplicationData, value: string) => {
    setBatchTemplate((prev) => ({ ...prev, [field]: value }));
  };

  const applyTemplateToBatch = () => {
    setBatchItems((prev) => prev.map((item) => ({ ...item, data: clone(batchTemplate) })));
    toast.success("Template applied to all");
  };

  const handleBatchFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_BATCH - batchItems.length;
    const toAdd = Array.from(files).slice(0, room).filter((f) => f.type.startsWith("image/"));
    const newItems: BatchItem[] = [];
    for (const file of toAdd) {
      const previewUrl = URL.createObjectURL(file);
      const dataUrl = await resizeImageToDataUrl(file);
      newItems.push({
        id: generateId(),
        file,
        fileName: file.name,
        previewUrl,
        dataUrl,
        data: clone(batchTemplate),
        status: "idle",
      });
    }
    setBatchItems((prev) => [...prev, ...newItems]);
  };

  const removeBatchItem = (id: string) => {
    setBatchItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearBatch = () => {
    batchItems.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setBatchItems([]);
    setBatchTemplate(clone(emptyApplicationData));
  };

  const verifyBatch = async () => {
    if (batchItems.length === 0) return;
    setIsBatchVerifying(true);
    const updated = [...batchItems];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (item.status !== "idle") continue;
      updated[i] = { ...item, status: "processing" };
      setBatchItems([...updated]);
      try {
        const res = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: item.dataUrl, data: item.data }) });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error);
        updated[i] = { ...updated[i], result: json.result, status: "done" };
      } catch (e: any) {
        updated[i] = { ...updated[i], status: "error", error: e.message || "Failed" };
      }
      setBatchItems([...updated]);
      await new Promise((r) => setTimeout(r, 250));
    }
    setIsBatchVerifying(false);
    toast.success("Batch complete");
  };

  const toggleExpandBatchItem = (id: string) => {
    setExpandedBatchItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // === Image handling (drag + drop + click + resize) ===
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (JPG, PNG, WEBP)");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Image is too large. Please use a photo under 25MB.");
      return;
    }

    // Clean old preview
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    const previewUrl = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreview(previewUrl);
    setResult(null);

    // Immediately resize for the API (snappy + efficient)
    try {
      const resized = await resizeImageToDataUrl(file);
      setImageDataUrl(resized);
      toast.success("Label photo ready", { description: "Resized locally for fast, accurate AI analysis." });
    } catch (e) {
      console.error(e);
      // Fallback: use original as data url (slower but works)
      const fallback = await fileToDataUrl(file);
      setImageDataUrl(fallback);
      toast.info("Using original image size (resize unavailable)");
    }
  };

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);

  const openFilePicker = () => fileInputRef.current?.click();

  const removeImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageDataUrl(null);
    setResult(null);
  };

  // === Verification ===
  const canVerify = Boolean(imageDataUrl && appData.brandName.trim() && appData.classType.trim());

  const runVerification = async () => {
    if (!imageDataUrl || !appData) return;

    setIsVerifying(true);
    setResult(null);
    setCurrentLoadingStep("resize");

    // Simulate perceived steps for snappiness (real work is fast)
    const stepSequence: LoadingStep[] = ["resize", "upload", "reading", "comparing"];
    let stepIndex = 0;

    const advanceStep = () => {
      if (stepIndex < stepSequence.length - 1) {
        stepIndex++;
        setCurrentLoadingStep(stepSequence[stepIndex]);
      }
    };

    // Advance steps on a pleasing cadence (actual API is usually 2.5-5s)
    const stepTimer = setInterval(advanceStep, 320);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageDataUrl,
          data: appData,
        }),
      });

      clearInterval(stepTimer);
      setCurrentLoadingStep("done");

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || "Verification failed");
      }

      const verification: VerificationResult = json.result;
      setResult(verification);

      const msg =
        verification.overallStatus === "pass"
          ? "All fields look good"
          : `${verification.issuesCount} issue${verification.issuesCount === 1 ? "" : "s"} found`;

      toast[verification.overallStatus === "pass" ? "success" : "warning"](msg, {
        description: "Review the detailed comparison below.",
      });
    } catch (err: any) {
      clearInterval(stepTimer);
      console.error(err);
      toast.error("Verification failed", {
        description: err.message || "Please check your image and try again.",
      });
    } finally {
      setIsVerifying(false);
      // Reset visual step after short delay
      setTimeout(() => setCurrentLoadingStep("idle"), 600);
    }
  };

  const reverify = () => {
    if (imageDataUrl) {
      runVerification();
    }
  };

  // === Rendering helpers ===
  const getStatusColor = (status: string) => {
    if (status === "exact_match") return "status-match";
    if (status === "fuzzy_match") return "status-fuzzy";
    return "status-mismatch";
  };

  const getStatusIcon = (status: string) => {
    if (status === "exact_match") return <CheckCircle2 className="h-4 w-4" />;
    if (status === "fuzzy_match") return <AlertTriangle className="h-4 w-4" />;
    return <X className="h-4 w-4" />;
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Top bar */}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e3a8a] text-white">
              {/* Bottle with reading glasses - "proof reading" the label (pun + Culture Mind energy) */}
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.9" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                {/* Bottle body - bourbon style */}
                <rect x="5.5" y="7.5" width="13" height="13.5" rx="2" />
                {/* Neck */}
                <rect x="8.5" y="3.5" width="7" height="5" rx="1" />
                {/* Cap */}
                <rect x="8" y="1.8" width="8" height="2" rx="0.5" />
                {/* Label hint */}
                <rect x="7.5" y="10.5" width="9" height="6" rx="1" />
                {/* Left lens (reading glasses) */}
                <rect x="5" y="9.5" width="4.5" height="3.2" rx="0.7" />
                {/* Right lens */}
                <rect x="14.5" y="9.5" width="4.5" height="3.2" rx="0.7" />
                {/* Bridge */}
                <line x1="9.5" y1="11.1" x2="14.5" y2="11.1" />
                {/* Left temple arm */}
                <line x1="5" y1="11.1" x2="3" y2="10" />
                {/* Right temple arm */}
                <line x1="19" y1="11.1" x2="21" y2="10" />
              </svg>
            </div>
            <div>
              <div className="font-semibold tracking-tight text-xl">Very Little Proof Indeed</div>
              <div className="text-[10px] text-zinc-500 -mt-0.5">TTB LABEL VERIFICATION • AI PROTOTYPE</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-800 px-3 py-0.5 text-xs font-medium">
              <Zap className="h-3.5 w-3.5" /> Target &lt; 5 seconds
            </div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600">
              No data stored
            </div>
            <button
              onClick={resetSingle}
              className="btn btn-ghost text-sm px-3 py-1.5"
              title="Clear everything and start fresh"
            >
              Start over
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero / Context */}
        <div className="mb-10 text-center max-w-2xl mx-auto">
          <h1 className="text-4xl font-semibold tracking-tighter text-balance">
            Very Little Proof Indeed
          </h1>
          <p className="mt-2 text-xl text-zinc-700 tracking-tight">
            AI-powered alcohol label verification for TTB
          </p>
          <p className="mt-4 text-lg text-zinc-600">
            A fast, simple prototype built for the Treasury TTB compliance workflow. 
            Drag in a label photo, enter the submitted values, and get a structured comparison in ~3–6 seconds — with special (and very strict) attention to the exact Government Warning requirements.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Based on discovery sessions with agents. Designed to be obvious for everyone from new hires to 28-year veterans. <span className="italic">(Culture Mind naming approved.)</span>
          </p>
        </div>

        {/* Tabs - addressing the "batch uploads would be huge" from the spec notes */}
        <div className="flex gap-1 mb-4 border-b border-zinc-200">
          <button onClick={() => setActiveTab('single')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'single' ? 'border-b-2 border-[#1e3a8a] text-[#1e3a8a]' : 'text-zinc-500 hover:text-zinc-700'}`}>Single Label Verification</button>
          <button onClick={() => setActiveTab('batch')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'batch' ? 'border-b-2 border-[#1e3a8a] text-[#1e3a8a]' : 'text-zinc-500 hover:text-zinc-700'}`}>Batch Upload (max {MAX_BATCH})</button>
        </div>

        {/* SINGLE VERIFICATION — the primary, beautiful, snappy experience */}
        <div className="card p-8 mb-8" style={{ display: activeTab === 'single' ? 'block' : 'none' }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-semibold text-2xl tracking-tight">Single Label Verification</div>
              <div className="text-sm text-zinc-500">Primary workflow • Fast • Clear results • <span className="italic">Very Little Proof Indeed</span></div>
            </div>
            <button onClick={resetSingle} className="btn btn-ghost text-sm">Clear form</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Application Data Form */}
            <div className="lg:col-span-3 space-y-5">
              <div className="uppercase tracking-[1px] text-xs font-semibold text-zinc-500">Application Data (what was submitted)</div>

              <div>
                <div className="field-label mb-1.5">Brand Name</div>
                <input
                  className="input"
                  placeholder="OLD TOM DISTILLERY"
                  value={appData.brandName}
                  onChange={(e) => updateField("brandName", e.target.value)}
                />
              </div>

              <div>
                <div className="field-label mb-1.5">Class / Type Designation</div>
                <input
                  className="input"
                  placeholder="Kentucky Straight Bourbon Whiskey"
                  value={appData.classType}
                  onChange={(e) => updateField("classType", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="field-label mb-1.5">Alcohol Content</div>
                  <input
                    className="input"
                    placeholder="45% Alc./Vol. (90 Proof)"
                    value={appData.alcoholContent}
                    onChange={(e) => updateField("alcoholContent", e.target.value)}
                  />
                </div>
                <div>
                  <div className="field-label mb-1.5">Net Contents</div>
                  <input
                    className="input"
                    placeholder="750 mL"
                    value={appData.netContents}
                    onChange={(e) => updateField("netContents", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="field-label mb-1.5">Producer / Bottler (optional)</div>
                  <input
                    className="input"
                    placeholder="Old Tom Distillery Co., Bardstown, KY"
                    value={appData.producer || ""}
                    onChange={(e) => updateField("producer", e.target.value)}
                  />
                </div>
                <div>
                  <div className="field-label mb-1.5">Country of Origin (optional)</div>
                  <input
                    className="input"
                    placeholder="United States"
                    value={appData.countryOfOrigin || ""}
                    onChange={(e) => updateField("countryOfOrigin", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="field-label">Government Warning (exact match required)</div>
                  <button
                    onClick={useStandardWarning}
                    className="text-xs font-medium text-[#1e3a8a] hover:underline"
                  >
                    Use standard warning text
                  </button>
                </div>
                <textarea
                  className="textarea font-mono text-sm leading-snug"
                  value={appData.governmentWarning}
                  onChange={(e) => updateField("governmentWarning", e.target.value)}
                  spellCheck={false}
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Must be verbatim, with "GOVERNMENT WARNING:" in all caps and bold.
                </p>
              </div>
            </div>

            {/* Image Upload */}
            <div className="lg:col-span-2">
              <div className="field-label mb-1.5">Label Photograph</div>

              {!imagePreview ? (
                <div
                  onClick={openFilePicker}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  className={cn(
                    "upload-zone flex flex-col items-center justify-center rounded-2xl h-[340px] text-center cursor-pointer p-8",
                    isDragging && "dragover"
                  )}
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm border">
                    <Upload className="h-7 w-7 text-[#1e3a8a]" />
                  </div>
                  <div className="font-semibold">Drop label photo here</div>
                  <div className="text-sm text-zinc-500 mt-1">or click to browse</div>
                  <div className="mt-4 text-xs text-zinc-400">JPG, PNG, WEBP • up to 25MB • works best with clear, well-lit photos</div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-zinc-200 bg-white shadow-sm">
                  <img
                    src={imagePreview}
                    alt="Uploaded label preview"
                    className="preview-img cursor-zoom-in"
                    onClick={() => setShowLightbox(true)}
                  />
                  <div className="absolute top-3 right-3 flex gap-2">
                    <button
                      onClick={() => setShowLightbox(true)}
                      className="btn btn-secondary text-xs px-3 py-1.5 shadow-sm"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" /> View larger
                    </button>
                    <button onClick={removeImage} className="btn btn-secondary text-xs px-3 py-1.5 shadow-sm">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="px-4 py-2 text-xs text-zinc-500 border-t bg-zinc-50 flex items-center justify-between">
                    <span className="truncate">{imageFile?.name}</span>
                    <span className="text-emerald-600 font-medium">Ready for AI</span>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <p className="text-xs text-zinc-500 mt-2">
                Tip: Slight angles and moderate glare are often handled well. The model was prompted for real-world photos.
              </p>
            </div>
          </div>

          {/* Big obvious action */}
          <div className="mt-8 flex flex-col items-center">
            <button
              onClick={runVerification}
              disabled={!canVerify || isVerifying}
              className="btn btn-primary text-base px-10 py-3.5 w-full max-w-md shadow-sm disabled:opacity-60"
            >
              {isVerifying ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" /> Verifying...
                </span>
              ) : (
                "Verify Label"
              )}
            </button>
            {!canVerify && (
              <p className="text-xs text-zinc-500 mt-2">
                {imageDataUrl
                  ? "Image ready. Fill in at least Brand Name and Class/Type on the left (the values submitted in the application) to enable verification."
                  : "Add a label photo and at least Brand + Class/Type to enable verification."}
              </p>
            )}
          </div>

          {/* Perceived progress / loading */}
          <AnimatePresence>
            {isVerifying && currentLoadingStep !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-5 max-w-md mx-auto"
              >
                <div className="text-center text-sm font-medium text-zinc-600 mb-3">Analyzing label with AI</div>
                <div className="space-y-2">
                  {LOADING_STEPS.map((step, idx) => {
                    const active = LOADING_STEPS.findIndex((s) => s.key === currentLoadingStep) >= idx;
                    return (
                      <div
                        key={step.key}
                        className={cn(
                          "flex items-center gap-3 text-sm px-3 py-1.5 rounded-lg",
                          active ? "text-zinc-800" : "text-zinc-400"
                        )}
                      >
                        <div className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[#1e3a8a]" : "bg-zinc-300")} />
                        {step.label}
                        {currentLoadingStep === step.key && <span className="loading-dot ml-auto">⋯</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="text-[11px] text-center text-zinc-400 mt-3">Most verifications complete in 3–5 seconds.</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RESULTS - only visible under the Single Label Verification tab */}
        <div style={{ display: activeTab === 'single' ? 'block' : 'none' }}>
          <AnimatePresence>
            {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Summary Banner */}
              <div
                className={cn(
                  "result-banner border flex items-start gap-3 text-base",
                  result.overallStatus === "pass"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                )}
              >
                {result.overallStatus === "pass" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                )}
                <div>
                  <div className="font-semibold">
                    {result.overallStatus === "pass"
                      ? "All checked fields match the application data."
                      : `${result.issuesCount} issue${result.issuesCount === 1 ? "" : "s"} detected — review details below.`}
                  </div>
                  {result.readabilityNote && (
                    <div className="text-sm opacity-90 mt-0.5">{result.readabilityNote}</div>
                  )}
                </div>
                <button onClick={reverify} className="ml-auto btn btn-secondary text-xs px-3 py-1 self-start">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Re-verify
                </button>
              </div>

              {/* Warning special callout (always prominent) */}
              {result.warningFormatting && (
                <div className="card border-l-4 border-l-[#1e3a8a] p-5">
                  <div className="uppercase text-xs font-semibold tracking-widest text-[#1e3a8a] mb-1">Government Warning — Strict Check</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className={cn("rounded px-3 py-2", result.warningFormatting.headerAllCaps ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
                      Header ALL CAPS: {result.warningFormatting.headerAllCaps ? "Yes ✓" : "No ✗"}
                    </div>
                    <div className={cn("rounded px-3 py-2", result.warningFormatting.appearsBold ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
                      Appears bold/prominent: {result.warningFormatting.appearsBold ? "Yes ✓" : "Unclear / No"}
                    </div>
                    <div className={cn("rounded px-3 py-2", result.warningFormatting.fullTextExact ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
                      Full text exact match: {result.warningFormatting.fullTextExact ? "Yes ✓" : "No ✗"}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-zinc-600">{result.warningFormatting.notes}</div>
                </div>
              )}

              {/* Side-by-side image + field table */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Image (click to enlarge) */}
                <div className="lg:col-span-2">
                  <div className="text-xs uppercase font-semibold text-zinc-500 mb-2">Label photo</div>
                  {imagePreview && (
                    <div
                      className="cursor-zoom-in rounded-xl overflow-hidden border border-zinc-200 bg-white shadow-sm"
                      onClick={() => setShowLightbox(true)}
                    >
                      <img src={imagePreview} alt="Label" className="w-full object-contain max-h-[380px]" />
                    </div>
                  )}
                  <button onClick={() => setShowLightbox(true)} className="mt-2 text-xs flex items-center gap-1 text-[#1e3a8a]">
                    <Eye className="h-3.5 w-3.5" /> Open full size for inspection
                  </button>
                </div>

                {/* Comparison table */}
                <div className="lg:col-span-3">
                  <div className="text-xs uppercase font-semibold text-zinc-500 mb-2">Field-by-field comparison</div>
                  <div className="card p-2">
                    {result.analyses.map((a, idx) => (
                      <div key={idx} className="field-row px-4 text-sm">
                        <div className="font-medium text-zinc-700 pt-0.5">{a.field}</div>
                        <div>
                          <div className="text-[10px] uppercase text-zinc-500">Application</div>
                          <div className="font-medium leading-tight">{a.applicationValue || "—"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-zinc-500">Extracted from label</div>
                          <div className="font-medium leading-tight">{a.extractedValue || "—"}</div>
                        </div>
                        <div>
                          <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold", getStatusColor(a.status))}>
                            {getStatusIcon(a.status)}
                            <span className="capitalize">{a.status.replace("_", " ")}</span>
                          </div>
                          <div className="text-xs text-zinc-600 mt-1 leading-snug">{a.explanation}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-3 px-1">
                    Fuzzy matches use human judgment for casing, punctuation, and minor wording variations (as described by agents).
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button onClick={reverify} className="btn btn-secondary">
                  <RefreshCw className="h-4 w-4 mr-2" /> Re-run verification with current values
                </button>
                <button onClick={resetSingle} className="btn btn-ghost">
                  Start a new verification
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* BATCH UPLOAD CARD - limited to 5 for prototype (API cost control) and addresses the "batch uploads would be huge" note from discovery */}
        <div className="card p-8 mb-8" style={{ display: activeTab === 'batch' ? 'block' : 'none' }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="font-semibold text-2xl tracking-tight">Batch Upload (max {MAX_BATCH})</div>
              <div className="text-sm text-zinc-500">Shared template • Live status • Artificial limit for this prototype</div>
            </div>
            <button onClick={clearBatch} className="btn btn-ghost text-sm">Clear batch</button>
          </div>

          {/* Template form (same fields as single) */}
          <div className="mb-6 p-4 bg-zinc-50 rounded-xl border">
            <div className="uppercase tracking-[1px] text-xs font-semibold text-zinc-500 mb-3">Template Application Data (applied to all items)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <div className="field-label mb-1 text-xs">Brand Name</div>
                <input className="input text-sm" placeholder="OLD TOM DISTILLERY" value={batchTemplate.brandName} onChange={(e) => updateBatchTemplate("brandName", e.target.value)} />
              </div>
              <div>
                <div className="field-label mb-1 text-xs">Class / Type Designation</div>
                <input className="input text-sm" placeholder="Kentucky Straight Bourbon Whiskey" value={batchTemplate.classType} onChange={(e) => updateBatchTemplate("classType", e.target.value)} />
              </div>
              <div>
                <div className="field-label mb-1 text-xs">Alcohol Content</div>
                <input className="input text-sm" placeholder="45% Alc./Vol. (90 Proof)" value={batchTemplate.alcoholContent} onChange={(e) => updateBatchTemplate("alcoholContent", e.target.value)} />
              </div>
              <div>
                <div className="field-label mb-1 text-xs">Net Contents</div>
                <input className="input text-sm" placeholder="750 mL" value={batchTemplate.netContents} onChange={(e) => updateBatchTemplate("netContents", e.target.value)} />
              </div>
            </div>
            <button onClick={applyTemplateToBatch} className="mt-3 btn btn-secondary text-xs px-3 py-1">Apply template to all items</button>
          </div>

          {/* Multi-file upload for batch */}
          <div
            onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = 'image/*'; input.onchange = (e) => handleBatchFiles((e.target as HTMLInputElement).files); input.click(); }}
            onDrop={(e) => { e.preventDefault(); handleBatchFiles(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            className="upload-zone flex flex-col items-center justify-center rounded-2xl h-28 text-center cursor-pointer mb-4"
          >
            <div className="font-semibold">Drop or click to add up to {MAX_BATCH} label photos</div>
            <div className="text-xs text-zinc-500 mt-1">Artificial limit for this prototype (API key usage control)</div>
          </div>

          {/* Batch items list - click each to toggle details (initially hidden) */}
          {batchItems.length > 0 && (
            <div className="space-y-2 mb-4">
              {batchItems.map((item) => {
                const isExpanded = expandedBatchItemIds.has(item.id);
                return (
                  <div key={item.id} className="border rounded-xl overflow-hidden bg-white">
                    <div 
                      onClick={() => toggleExpandBatchItem(item.id)}
                      className="flex items-center gap-3 p-2 cursor-pointer hover:bg-zinc-50 text-sm"
                    >
                      <img src={item.previewUrl} alt="" className="w-10 h-10 object-contain rounded border bg-zinc-50 flex-shrink-0" />
                      <div className="flex-1 min-w-0 truncate">{item.fileName}</div>
                      <div className="text-xs">
                        {item.status === "idle" && <span className="px-2 py-0.5 bg-zinc-100 rounded">Ready</span>}
                        {item.status === "processing" && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Processing...</span>}
                        {item.status === "done" && item.result && (
                          <span className={item.result.overallStatus === "pass" ? "text-emerald-600" : "text-amber-600"}>
                            {item.result.overallStatus === "pass" ? "Clean" : `${item.result.issuesCount} issues`}
                          </span>
                        )}
                        {item.status === "error" && <span className="text-red-600">Error</span>}
                      </div>
                      <div className="text-xs text-zinc-400">{isExpanded ? '▲' : '▼'} Click for details</div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeBatchItem(item.id); }} 
                        className="text-xs text-red-600 hover:underline ml-2"
                      >
                        Remove
                      </button>
                    </div>
                    {isExpanded && item.result && (
                      <div className="p-3 border-t bg-zinc-50 text-sm">
                        {item.result.warningFormatting && (
                          <div className="mb-2">
                            <div className="font-semibold text-xs mb-1">Government Warning Details:</div>
                            <div className="text-xs space-x-2">
                              <span className={item.result.warningFormatting.headerAllCaps ? "text-emerald-600" : "text-red-600"}>Header ALL CAPS: {item.result.warningFormatting.headerAllCaps ? "Yes" : "No"}</span>
                              <span className={item.result.warningFormatting.appearsBold ? "text-emerald-600" : "text-amber-600"}>Bold: {item.result.warningFormatting.appearsBold ? "Yes" : "Unclear"}</span>
                              <span className={item.result.warningFormatting.fullTextExact ? "text-emerald-600" : "text-red-600"}>Exact text: {item.result.warningFormatting.fullTextExact ? "Yes" : "No"}</span>
                            </div>
                            <div className="text-xs text-zinc-600 mt-1">{item.result.warningFormatting.notes}</div>
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-xs mb-1">Field Issues:</div>
                          {item.result.analyses.filter(a => a.status !== "exact_match").length > 0 ? (
                            item.result.analyses.map((a, idx) => (
                              a.status !== "exact_match" && (
                                <div key={idx} className="text-xs mb-0.5">
                                  <span className="font-medium">{a.field}:</span> {a.status} - {a.explanation}
                                </div>
                              )
                            ))
                          ) : (
                            <div className="text-xs text-emerald-600">No issues - all fields match the template.</div>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1">Click item header again to collapse.</div>
                      </div>
                    )}
                    {isExpanded && !item.result && (
                      <div className="p-3 border-t bg-zinc-50 text-xs text-zinc-500">No result yet (item not verified or errored).</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={verifyBatch}
            disabled={batchItems.length === 0 || isBatchVerifying}
            className="btn btn-primary w-full max-w-sm mx-auto block disabled:opacity-60"
          >
            {isBatchVerifying ? "Verifying batch..." : `Verify Batch (${batchItems.length}/${MAX_BATCH})`}
          </button>
          <p className="text-[10px] text-center text-zinc-500 mt-2">Limited to {MAX_BATCH} for this prototype (to control API usage while demonstrating the requested batch capability from the spec).</p>
        </div>

        {/* Samples / Batch Example at bottom - replaced based on tab */}
        <div className="mt-12">
          {activeTab === 'single' ? (
            <>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="font-semibold text-xl tracking-tight">Sample Labels</div>
                  <div className="text-sm text-zinc-600">Click any sample to instantly populate the form + photo above. Then hit Verify (or use auto-verify for one-click demo).</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {SAMPLE_CONFIGS.map((sample) => (
                  <div key={sample.id} className="card overflow-hidden group">
                    <div className="relative">
                      <img
                        src={sample.imagePath}
                        alt={sample.name}
                        className="w-full h-28 object-cover bg-zinc-100"
                      />
                      <div className="absolute top-2 right-2 text-[10px] px-1.5 py-px rounded bg-black/60 text-white font-mono tracking-wider">
                        {sample.expectedIssues > 0 ? `${sample.expectedIssues} issue${sample.expectedIssues > 1 ? "s" : ""}` : "CLEAN"}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="font-medium text-sm leading-tight mb-0.5">{sample.name}</div>
                      <div className="text-[11px] text-zinc-500 mb-2 line-clamp-2">{sample.description}</div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => loadSample(sample, false)}
                          className="flex-1 text-[10px] leading-tight btn btn-secondary py-1"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => loadSample(sample, true)}
                          className="flex-1 text-[10px] leading-tight btn btn-primary py-1"
                        >
                          Load + Verify
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-center text-zinc-400 mt-3">Samples were generated to demonstrate the exact requirements and edge cases from the discovery notes (warning formatting, brand nuance, real-world photo challenges).</p>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="font-semibold text-xl tracking-tight">Batch Example (5 identical photos)</div>
                  <div className="text-sm text-zinc-600">This replaces the samples gallery when in Batch tab. 5 copies of one sample photo using the shared template (test batch example).</div>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {[1,2,3,4,5].map((num) => (
                  <div key={num} className="card p-2 text-center">
                    <img src="/samples/perfect-bourbon.jpg" alt={`Batch example item ${num}`} className="w-full h-20 object-contain mx-auto mb-1" />
                    <div className="text-xs font-medium">Item {num}/5</div>
                    <div className="text-[10px] text-emerald-600">Matches template ✓</div>
                  </div>
                ))}
              </div>

              {/* Buttons for the entire batch example, same format as single samples */}
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => loadBatchExample(false)}
                  className="flex-1 text-[10px] leading-tight btn btn-secondary py-1"
                >
                  Load
                </button>
                <button
                  onClick={() => loadBatchExample(true)}
                  className="flex-1 text-[10px] leading-tight btn btn-primary py-1"
                >
                  Load + Verify
                </button>
              </div>

              <p className="text-[11px] text-center text-zinc-400 mt-3">Example of a clean batch of 5 identical labels using the shared template. Click Load or Load + Verify to populate the batch list above (and verify if chosen).</p>
            </>
          )}
        </div>

        <footer className="mt-16 text-center text-xs text-zinc-400">
          Standalone prototype for evaluation purposes only. • No images or results are stored. • Built with Next.js + xAI / OpenAI vision for speed and accuracy.
        </footer>
      </main>

      {/* Simple accessible lightbox */}
      <AnimatePresence>
        {showLightbox && imagePreview && (
          <div
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setShowLightbox(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-[94vw] max-h-[92vh] relative"
              onClick={(e) => e.stopPropagation()}
            >
              <img src={imagePreview} alt="Label full size" className="max-h-[92vh] max-w-[94vw] object-contain rounded-xl shadow-2xl" />
              <button
                onClick={() => setShowLightbox(false)}
                className="absolute -top-3 -right-3 bg-white text-black rounded-full p-2 shadow"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
