<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agreement Chatbot</title>
    <link rel="stylesheet" href="/styles.css" />
    <style>
      body { display: flex; align-items: center; justify-content: center; padding: 24px; }
      .chat-shell { width: min(900px, 100%); background: white; border: 1px solid #dfe7f3; border-radius: 18px; box-shadow: 0 16px 42px rgba(15, 23, 42, 0.1); overflow: hidden; }
      .chat-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; background: #eef2ff; border-bottom: 1px solid #dfe7f3; }
      .chat-window { min-height: 420px; max-height: 540px; overflow-y: auto; padding: 20px; background: #f8fafc; display: flex; flex-direction: column; gap: 12px; }
      .message { max-width: 80%; padding: 12px 16px; border-radius: 16px; white-space: pre-wrap; }
      .bot { background: #e2e8f0; align-self: flex-start; }
      .user { background: #2563eb; color: white; align-self: flex-end; }
      .chat-form { display: flex; gap: 10px; padding: 18px 20px 22px; }
      .chat-form input { flex: 1; padding: 12px 14px; border: 1px solid #dfe7f3; border-radius: 10px; }
      .chat-form button { padding: 12px 18px; border: none; background: #1d4ed8; color: white; border-radius: 10px; cursor: pointer; }
      .status { padding: 0 20px 12px; color: #1e3a8a; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="chat-shell">
      <div class="chat-header">
        <h1>Agreement Chatbot</h1>
        <a href="/" style="color: #1d4ed8; font-weight: 700; text-decoration: none;">Back to form</a>
      </div>
      <div class="chat-window" id="chatWindow" aria-live="polite">
        <div class="message bot">Hello. I can walk you through the agreement in order, explain each section in plain language, and save the completed answers to the same application record as the direct form.</div>
      </div>
      <div class="status" id="statusBox">Status: Ready</div>
      <form class="chat-form" id="chatForm">
        <input id="chatInput" type="text" autocomplete="off" placeholder="Type your answer or ask a question..." required />
        <button type="submit">Send</button>
      </form>
    </div>

    <script src="/chatbot.js"></script>
  </body>
</html>
