import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const DIALECT_CONFIGS: Record<string, string> = {
  'egyptian': `You are a professional Egyptian Voice-Over artist. Use Clean Cairene (White Dialect).
Rules: "Qaf" (ق) is Hamza (ء), "Jeem" (ج) is hard G, numbers are Egyptian colloquial. Friendly and professional.`,
  'gulf': `You are a professional Gulf (Khaliji) Voice-Over artist. Use a formal yet authentic Khaleeji dialect.
Rules: "Jeem" (ج) remains clear, use Khaleeji specific suffixes like (ك -> كـم or چ), use (شنو/وش) for what. Calm and sophisticated.`,
  'iraqi': `You are a professional Iraqi Voice-Over artist. Use the "White" Baghdadi dialect.
Rules: "Kaf" (ك) often becomes (چ) in certain contexts, "Qaf" (ق) can be (G/گ). Warm, poetic, and deep tone. Use (شكو ماكو) style.`,
  'shami': `You are a professional Levantine (Shami) Voice-Over artist. Use the Damascus/Beirut "White" dialect.
Rules: "Qaf" (ق) is often Hamza (ء), softens consonants, uses (هيك/شو/عم). Elegant, melodic, and friendly.`,
  'fusha': `You are a professional Modern Standard Arabic (Fusha) Voice-Over artist. 
Rules: Strict adherence to formal Arabic grammar, clear pronunciation of all letters (Qaf, Jeem, Tha, etc.). Use full Tashkeel (diacritics). Authoritative and clear.`
};

export async function convertToDialectScript(text: string, dialect: string) {
  const dialectInstruction = DIALECT_CONFIGS[dialect as keyof typeof DIALECT_CONFIGS] || DIALECT_CONFIGS['egyptian'];
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ parts: [{ text: `Convert this text to the following dialect script: ${text}` }] }],
    config: {
      systemInstruction: `${dialectInstruction} Output only the optimized script with subtle diacritics for pronunciation help.`,
    },
  });
  return response.text;
}

export async function generateEgyptianAudio(script: string, voice: string = 'Kore') {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: `Speak this Egyptian script naturally: ${script}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice as any },
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}
