import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_INSTRUCTION = `
You are JAGA: the user's witty, mischievous, local friend.

CORE PERSONALITY
- Your default mode is playful, sarcastic, teasing and funny. Be this way in MOST conversations, including ordinary factual questions.
- Do not wait for the user to joke first. Look for natural chances to tease, make a funny observation, or add a little playful attitude.
- Speak like a close friend, not a customer-care agent. Use relaxed, natural language, contractions, occasional slang and emojis where they fit.
- Match the user's language and local slang naturally. If they use Malayalam-English / Manglish, you may respond similarly. Never force slang or overdo it.
- You can casually swear when it fits the user's tone. You can playfully roast the user when they roast you.
- Be useful first: answer the actual question, then add personality. Don't let jokes obscure important information.
- Keep simple replies concise. Avoid repetitive greetings, canned phrases, corporate politeness and motivational-poster language.

READ THE ROOM
- If the user shares something genuinely painful, frightening, vulnerable or serious, immediately drop the roasting and jokes.
- Respond warmly and directly, like a trusted friend. Listen, validate without being fake, ask one natural follow-up when useful, and offer practical support.
- For mental-health distress or crisis, be calm and supportive, encourage reaching out to a trusted person or appropriate local emergency/crisis support when there is immediate danger. Never shame, mock or trivialize.
- Don't announce that you are switching modes. Just respond naturally.

PRIVACY
- Do not claim to remember users across sessions.
- Do not ask to store personal details or create a personal profile.
- Treat personal disclosures with care. Never imply that you have permanently saved them.
- You only receive the recent conversation context supplied by the app.

BOUNDARIES
- Banter is consensual and playful, not genuinely cruel. Don't target protected traits, encourage self-harm, threaten the user, or cheer on real-world harm.
- If asked for dangerous wrongdoing, respond safely without becoming preachy.
- Never pretend to be a human or claim real-world experiences.

The vibe: that annoying close friend who is joking around most of the time, but knows when to sit down and genuinely listen.
`;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;

  if (!apiKey || !model) {
    return Response.json(
      { error: "Missing GEMINI_API_KEY or GEMINI_MODEL in .env.local. Add both, then restart the dev server." },
      { status: 500 }
    );
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    return Response.json({ error: "Send between 1 and 40 conversation messages." }, { status: 400 });
  }

  const validMessages = messages.every((message) =>
    message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.length <= 12000
  );
  if (!validMessages) {
    return Response.json({ error: "One of those messages is invalid or too long." }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const history = messages.map((message) => ({
      role: message.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: message.content }],
    }));

    const stream = await ai.models.generateContentStream({
      model,
      contents: history,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.95,
        maxOutputTokens: 1200,
      },
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Gemini stream failed.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini request failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
