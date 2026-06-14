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
    console.error("Verify error:", err);

    const message =
      err?.message?.includes("API key") || err?.message?.includes("key")
        ? "API key is missing or invalid. Add XAI_API_KEY or OPENAI_API_KEY to your environment."
        : err?.message || "Unexpected error during verification. Please try again.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
