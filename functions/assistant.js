
const OpenAI = require("openai");

require("dotenv").config();

const assistantId = process.env.ASSISTANT_ID;

const openai = new OpenAI();

const messageBeginning = `Can you tell me does this contain gluten`;

/*
VOICES:
  - onyx
  - echo
  - alloy
  - fable
  - nova
  - shimmer
*/

const VOICE = "fable";

const createAudio = async (messageId, textContent) => {
  console.log("create audio for message id", messageId);
  console.log(textContent);
  console.log("-------------");

  const mp3 = await openai.audio.speech.create({
    model: "tts-1",
    voice: VOICE,
    input: textContent,
  });

  const arrBuffer = await mp3.arrayBuffer();
  return Buffer.from(arrBuffer);
};

const checkMessages = async (threadId) => {
  if (!threadId) {
    console.log("no threadId provided");
    return;
  }
  const messages = await openai.beta.threads.messages.list(threadId);
  return messages;
};

const getAssistantMessages = async (threadId) => {
  const messages = await checkMessages(threadId);
  const assistantAnswers = messages.data
      .filter((message) => message.role === "assistant");
  return assistantAnswers;
};

const askAiWhatToDo = async (string) => {
  const thread = await openai.beta.threads.create();
  const threadId = thread.id;

  await openai.beta.threads.messages.create(
      thread.id,
      {
        role: "user",
        content: `${messageBeginning} ${string}`,
      },
  );

  await openai.beta.threads.runs.create(
      thread.id,
      {
        assistant_id: assistantId,
      },
  );

  return threadId;
};

module.exports = {
  askAiWhatToDo,
  checkMessages,
  createAudio,
  getAssistantMessages,
};
