import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import { App } from "./ui/app/App";
import { Toaster } from "./ui/shared/Toaster";
import { UpdateBanner } from "./ui/updates/UpdateBanner";
import { WhatsNewModal } from "./ui/updates/WhatsNewModal";
import { store } from "./store/store";
import "./ui/styles/index.css";
import "./ui/sidebar/Sidebar.css";
import "./ui/chat/ChatTranscript.css";
import "./ui/chat/UserMessageBubble.css";
import "./ui/chat/AssistantMessage.css";
import "./ui/chat/ChatComposer.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter>
        <App />
        <Toaster />
        <UpdateBanner />
        <WhatsNewModal />
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
