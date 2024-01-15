const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const formidable = require("formidable-serverless");

const {initializeApp} = require("firebase-admin/app");
const {getStorage, getDownloadURL} = require("firebase-admin/storage");
const {getDatabase} = require("firebase-admin/database");

const vision = require("@google-cloud/vision");
const credentials = require("./service_secret.json");

const {
  askAiWhatToDo,
  createAudio,
  getAssistantMessages,
} = require("./assistant");

setGlobalOptions({region: "europe-west3", maxInstances: 3});
initializeApp();

const client = new vision.ImageAnnotatorClient({
  credentials,
});

const bucket = getStorage().bucket();
const db = getDatabase();

const createSpeech = async (messageId, textContent) => {
  console.log("value does not exist. create it");
  console.log("started state saved");
  const buffer = await createAudio(messageId, textContent);
  console.log("Buffer was received by index.js");
  console.log("The mp3 has been created!");
  console.log("-----------------------------------------");

  const filename = `${messageId}.mp3`;
  const file = await bucket.file(`audio/${filename}`);
  await file.save(buffer, {contentType: "audio/mpeg"});

  const url = await getDownloadURL(file);
  return url;
};

const startAudioGeneration = async (message) => {
  const textContent = message.content
      .map((content) => content.text.value).join(" ");

  if (!textContent) {
    return false;
  }

  const refStr = `audio/${message.id}`;
  const ref = db.ref(refStr);
  const snapshot = await ref.once("value");
  const val = snapshot.val();

  if (val && val.audio) {
    console.log(message.id, "Audio already created ");
    return;
  }

  console.log(message.id, "start creating audio for");
  await ref.set({
    status: "started",
    audio: null,
  });

  const url = await createSpeech(message.id, textContent);
  console.log(message.id, "mp3 done!");

  await ref.set({
    status: "complete",
    audio: url,
  });
};

const addAudioInfo = async (message) => {
  const refStr = `audio/${message.id}`;
  const ref = db.ref(refStr);
  const snapshot = await ref.once("value");
  const val = snapshot.val();

  if (val && val.audio) {
    console.log("Audio already created!");
    console.log(val);
    return {
      ...message,
      audio: val.audio,
    };
  }

  if (!val) {
    startAudioGeneration(message);
  }

  return message;
};

exports.messages = onRequest(async (req, res) => {
  const threadId = req.params[0];

  console.log("user asks for data on:", threadId);

  if (!threadId) {
    console.log("user did not provide threatId");
    res.send({error: "please provide thread id"});
    return;
  }

  const messages = await getAssistantMessages(threadId) || [];
  const messagePromises = messages
      .map(async (message) => await addAudioInfo(message));

  const messagesWithAudio = await Promise.all(messagePromises);

  res.status(200).send({messages: messagesWithAudio
      .filter((message) => message.audio)});
});

exports.upload = onRequest(async (req, res) => {
  console.log("/upload request");
  console.log("----------------------");

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.log("error parsing the form", err);
      res.send({
        error: err,
      });
      return;
    }

    const file = files.file;
    const filePath = file.path;

    if (!file) {
      const message = "file not found";
      console.log(message);
      res.send({
        error: message,
      });
      return;
    }

    console.log("Send data to Google Vision API");
    const [result] = await client.textDetection(filePath);
    const text = result.textAnnotations[0].description;

    console.log("Google has done its part");
    console.log("");

    console.log("Data to be sent to OpenAI");
    console.log("--------------------------------");
    console.log("");
    console.log(text);
    console.log("");

    if (!text) {
      const message = "Google did not find any text in the image";
      console.log(message);
      res.send({
        error: message,
      });
      return;
    }

    console.log("Start the AI work");
    console.log("--------------------------------");
    const threadId = await askAiWhatToDo(text);

    console.log("Thread created with id", threadId);
    console.log("/upload request done");
    console.log("--------------------------------");
    console.log("");

    if (threadId) {
      res.status(200).send({
        threadId,
        textsFound: text,
      });

      return;
    }

    res.status(200).send({message: "something went wrong"});
  });
});
