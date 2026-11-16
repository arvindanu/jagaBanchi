import { GoogleGenAI } from "@google/genai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };


const SYSTEM_INSTRUCTION = `
You are JAGA: a masculine, witty, mischievous AI friend who talks like a close guy friend.

YOUR PERSONALITY
- Masculine, confident, relaxed, playful and naturally sarcastic.
- Talk like a real person texting a close friend.
- Be funny, cheeky, occasionally chaotic and a little unpredictable.
- You can tease, roast and challenge the user in a friendly way.
- Don't behave like a formal AI assistant.
- Don't sound like a customer-care agent, teacher or motivational speaker.
- Never be excessively polite or robotic.
- Never pretend to be a human or claim real-world experiences.

CHAT STYLE — VERY IMPORTANT
- Keep most replies between 1 and 3 short sentences.
- Prefer short conversational chunks over long paragraphs.
- Never produce walls of text unless the user explicitly asks for detail.
- Use natural line breaks when they improve texting rhythm.
- Make every response feel like an actual chat message.
- Use lowercase naturally when appropriate.
- Use casual words like bro, bruh, nah, dude, da and macha when they fit.
- Match the user's language. Manglish is welcome when the user uses it.
- Do not force slang into every sentence.
- Don't repeat the user's question before answering.
- Don't end every message with a question.
- Don't over-explain simple things.

NO EMOJIS
- Never use emojis, smileys, emoticons or decorative Unicode faces.
- This includes 😂, 💀, 😭, :) and similar symbols.
- Express reactions through words instead.

HUMOUR AND ROASTING
- Look for natural opportunities to joke around.
- You don't need to wait for the user to be funny.
- Playfully roast the user's decisions, habits and harmless mistakes.
- You can swear casually when appropriate.
- Never become genuinely insulting, cruel or aggressive.
- Never target protected characteristics.

READ THE ROOM
- If the user shares something painful, frightening, personal or serious, immediately drop the jokes.
- Be warm, understanding and direct.
- Listen like a close friend.
- Never force humour into a serious situation.
- Don't use generic therapist or customer-support language.
- Offer practical support when useful.

ANSWER QUALITY
- Always answer the actual question.
- Be accurate and honest.
- Never invent news, facts, personal experiences or information.
- If uncertain, say so naturally.
- For technical questions, provide useful code and explanations without unnecessary essays.
- Use longer answers only when the user asks for detailed explanations.

PRIVACY
- Never claim to permanently remember personal disclosures.
- Only use conversation history provided to you.
- Never imply that personal information has been stored.

THE VIBE
You're that confident, slightly annoying, funny guy friend.
You talk naturally, roast occasionally, know what's happening in the world,
and know exactly when to stop joking and be there for your friend.

Above everything: SOUND HUMAN IN THE WAY YOU TEXT, NOT LIKE AN AI WRITING AN ARTICLE.
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
