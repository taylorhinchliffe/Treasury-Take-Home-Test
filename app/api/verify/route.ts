import { NextRequest, NextResponse } from "next/server";
import { verifyLabel } from "@/lib/ai";
import { ApplicationData } from "@/lib/types";

export const runtime = "nodejs"; // reliable for larger payloads / OpenAI SDK
export const maxDuration = 30; // generous for vision + slow networks

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { image, data } = body as {
      image?: string;
      data?: ApplicationData;
    };

    if (!image || typeof image !== "string" || !image.startsWith("data:image")) {
      return NextResponse.json(
        { error: "Missing or invalid image data URL" },
        { status: 400 }
      );
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Missing application data" },
        { status: 400 }
      );
    }

    // Basic guard: data URL length (after our client resize this is typically < 1.5MB)
    if (image.length > 4_500_000) {
      return NextResponse.json(
        { error: "Image too large after processing. Please use a clearer, smaller photo." },
        { status: 413 }
      );
    }

    const result = await verifyLabel(image, data as ApplicationData);

    return NextResponse.json({ result });
  } catch (err: any) {
    console.error("Verify error (full):", err);

    const rawMessage = err?.message || "";
    const lower = rawMessage.toLowerCase();

    let userMessage: string;

    if (lower.includes("missing api key") || lower.includes("set xai_api_key") || lower.includes("set openai_api_key")) {
      userMessage = "API key is missing. In Vercel, go to your project Settings → Environment Variables, add XAI_API_KEY (with value from https://console.x.ai), make sure Production is checked, then redeploy the project.";
    } else if (lower.includes("api key") || lower.includes("authentication") || lower.includes("invalid") || lower.includes("unauthorized") || lower.includes("quota") || lower.includes("credit") || lower.includes("billing") || lower.includes("insufficient")) {
      userMessage = "Problem with the AI provider (likely invalid/expired key, insufficient credits, or rate limit). Double-check that the XAI_API_KEY value in Vercel is correct and that your xAI account has available balance, then redeploy and try again.";
    } else {
      userMessage = rawMessage || "Unexpected error during verification. Please try again.";
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
