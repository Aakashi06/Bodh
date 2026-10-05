<div align="center">

# Bodh

**Multilingual Indian voice AI for learning.**

Speak in English, Hindi, or Hinglish. Ask anything. Learn through a conversation that answers in the same voice.

<br />

[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://github.com/Aakashi06/Bodh)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://github.com/Aakashi06/Bodh)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://github.com/Aakashi06/Bodh)
[![Sarvam](https://img.shields.io/badge/Sarvam-STT%20%C2%B7%20Chat%20%C2%B7%20TTS-111111?style=for-the-badge)](https://www.sarvam.ai/)
[![Languages](https://img.shields.io/badge/voice-English%20%C2%B7%20Hindi%20%C2%B7%20Hinglish-F4A261?style=for-the-badge)](https://github.com/Aakashi06/Bodh)

<br />

[Source](https://github.com/Aakashi06/Bodh) · [Author](https://github.com/Aakashi06)

Speak naturally. Ask anything. Learn through conversation.

</div>

---

Bodh is a multilingual voice learning companion for school students. A question can arrive in English, Hindi, Hinglish, or another Indian language Sarvam supports. The same turn comes back as speech.

Sarvam is the whole voice stack: **Saaras** for speech-to-text, **sarvam-105b-conversations** for the answer, and **Bulbul** for text-to-speech. Speech-to-text runs in `codemix` mode, so a sentence that switches between Hindi and English stays one question.

## Interface

<p align="center">
  <img width="48%" alt="Bodh home" src="https://github.com/user-attachments/assets/ef96789b-8223-400d-bded-32450984ffe5" />
  <img width="48%" alt="Bodh conversation" src="https://github.com/user-attachments/assets/1c22fd07-83c7-4b20-b4f7-df980f16b5e7" />
</p>

<p align="center">
  <sub>Home · conversation</sub>
</p>

---

## Indian voice

The product is built around how students in India actually ask.

| | |
| --- | --- |
| **English** | A clear classroom question, answered in English. |
| **Hindi** | A full question in Hindi, answered in Hindi. Default voice language is `hi-IN`. |
| **Hinglish** | Hindi and English in the same sentence. Codemix speech-to-text keeps that mix intact. |
| **Other Indian languages** | Any language the Sarvam speech models support on the account. Detected language is passed into the voice reply. |

Voice speaker is **Shubh** on Bulbul `v3`. The reply is spoken in the language detected from the question.

---

## Voice pipeline

One request runs the full Indian voice loop.

```text
Voice in
   ↓
Saaras speech-to-text   (codemix, Indian languages)
   ↓
Sarvam chat             (sarvam-105b-conversations)
   ↓
Bulbul text-to-speech   (speaker: shubh)
   ↓
Voice out
```

<p align="center">
  <img width="420" alt="Bodh voice pipeline" src="https://github.com/user-attachments/assets/37be9f8d-2261-4d57-8407-28b078caa460" />
</p>

`POST /api/voice` is that loop in one call: audio in, transcript, written answer, spoken answer, and follow-up suggestions out.

| Step | Route | Model |
| --- | --- | --- |
| Transcribe | `POST /api/transcribe` | Saaras `v4`, mode `codemix` |
| Reason | `POST /api/chat` and `POST /api/chat/stream` | `sarvam-105b-conversations` |
| Speak | `POST /api/speak` | Bulbul `v3`, speaker `shubh` |
| Full turn | `POST /api/voice` | STT, then chat, then TTS |

Text chat streams over SSE. A voice turn also returns the transcript, so the student can read what was heard.

---

## Example conversations

**English**

> Why does the moon change shape?
>
> It does not. We see different amounts of its lit side as it moves around Earth. That is a phase, not a new moon each night.

**Hindi**

> प्रकाश संश्लेषण क्या है?
>
> पौधे सूरज की रोशनी, पानी और कार्बन डाइऑक्साइड से अपना भोजन बनाते हैं। इसी प्रक्रिया को प्रकाश संश्लेषण कहते हैं।

**Hinglish**

> Photosynthesis ko simple Hindi mein samjhaao.
>
> Plant sunlight leta hai, paani leta hai, aur carbon dioxide leta hai. In teeno se wo apna khana banata hai. Isi ko photosynthesis kehte hain.

---

## Features

- **Multilingual Indian voice.** English, Hindi, Hinglish, and other supported Indian languages in one companion.
- **Codemix speech-to-text.** Mixed Hindi–English speech is transcribed as one question.
- **Spoken answers.** Bulbul speaks the reply in the detected language.
- **Learning chat.** Answers come with follow-up suggestions, so the next question is one tap away.
- **Text or voice.** Type in the chat, or hold the mic and talk.
- **Streaming replies.** Text answers stream token by token over SSE.
- **One provider.** Sarvam handles speech-to-text, chat, and text-to-speech.

---

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19, Vite, Lucide |
| API | FastAPI, Uvicorn |
| Speech-to-text | Sarvam Saaras `v4`, `codemix` |
| Chat | Sarvam `sarvam-105b-conversations` |
| Text-to-speech | Sarvam Bulbul `v3`, speaker `shubh` |
| Default voice | `hi-IN` |

---

## Project layout

```text
Bodh/
├── frontend/
│   ├── src/App.jsx
│   ├── src/api.js
│   ├── src/components/
│   └── src/hooks/
├── backend/
│   └── app/
│       ├── main.py              # chat, stream, transcribe, speak, voice
│       ├── services/llm.py      # Sarvam chat
│       └── services/speech.py   # Saaras STT + Bulbul TTS
├── .env.example
└── README.md
```

---

## Run it

```bash
git clone https://github.com/Aakashi06/Bodh.git
cd Bodh
cp .env.example .env
```

Put a Sarvam API key in `.env`.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, usually [http://localhost:5173](http://localhost:5173). The API is [http://127.0.0.1:8000](http://127.0.0.1:8000).

---

## Author

Built by [Aakashi06](https://github.com/Aakashi06).

An AI learning companion for school students who would rather ask out loud, in the language they already speak.
