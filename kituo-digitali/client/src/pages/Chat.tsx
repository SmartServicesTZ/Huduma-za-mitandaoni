import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Ban, Check, CheckCheck, File, ImagePlus, MessageCircle, Mic, Paperclip, Reply, Send, ShieldAlert, Smile, StopCircle, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { blockChatUser, findChatUser, loadChatAttachment, markChatMessageRead, openPrivateConversation, reportChatUser, sendChatMessage, setChatTyping, subscribeConversations, subscribePresence, subscribePrivateChat, subscribePublicChat, subscribeTyping, updatePresence, uploadChatFile, type ChatMessage, type ChatUser, type PrivateConversation } from "@/lib/firebase";
import "./chat.css";

const emojis = ["😀", "😂", "🥰", "😍", "👍", "🙏", "❤️", "🎉", "😢", "🔥"];
function dateLabel(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") return (value as any).toDate().toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" });
  return "";
}

export default function ChatPage() {
  const { firebaseUser, profile, isAuthenticated } = useAuth();
  const [view, setView] = useState<"public" | "private">("public");
  const [publicMessages, setPublicMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [privateMessages, setPrivateMessages] = useState<ChatMessage[]>([]);
  const [roomId, setRoomId] = useState("");
  const [draft, setDraft] = useState("");
  const [phoneLookup, setPhoneLookup] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen?: unknown } | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [fileBusy, setFileBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);

  const self: ChatUser | null = firebaseUser ? { uid: firebaseUser.uid, name: profile?.name ?? firebaseUser.displayName ?? "Mwanachama", phone: profile?.phone ?? "" } : null;
  const currentConversation = conversations.find((item) => item.id === roomId);
  const otherUid = currentConversation?.participants.find((uid) => uid !== firebaseUser?.uid) ?? "";
  const otherUser = currentConversation && otherUid ? { uid: otherUid, name: currentConversation.names?.[otherUid] ?? "Mwanachama", phone: currentConversation.phones?.[otherUid] ?? "" } : null;
  const activeMessages = view === "public" ? publicMessages : privateMessages;

  useEffect(() => {
    if (!firebaseUser) return;
    const update = () => { void updatePresence(firebaseUser.uid, document.visibilityState === "visible").catch(() => undefined); };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", update);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("pagehide", update); void updatePresence(firebaseUser.uid, false).catch(() => undefined); };
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribePublicChat(setPublicMessages, () => toast.error("Imeshindikana kupakia public chat."));
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser) return;
    return subscribeConversations(firebaseUser.uid, setConversations, () => toast.error("Imeshindikana kupakia mazungumzo."));
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser || !roomId || view !== "private") { setPrivateMessages([]); setTyping([]); setPresence(null); return; }
    const stopMessages = subscribePrivateChat(roomId, setPrivateMessages, () => toast.error("Imeshindikana kupakia ujumbe binafsi."));
    const stopTyping = subscribeTyping(roomId, setTyping, () => undefined);
    const stopPresence = otherUid ? subscribePresence(otherUid, setPresence) : () => {};
    return () => { stopMessages(); stopTyping(); stopPresence(); };
  }, [firebaseUser, roomId, otherUid, view]);
  useEffect(() => {
    if (!firebaseUser) return;
    const stops = conversations.map((conversation) => subscribePrivateChat(conversation.id, (rows) => {
      const count = rows.filter((message) => message.senderId !== firebaseUser.uid && !message.readBy?.includes(firebaseUser.uid)).length;
      setUnread((previous) => ({ ...previous, [conversation.id]: count }));
    }, () => undefined));
    return () => stops.forEach((stop) => stop());
  }, [firebaseUser, conversations.map((item) => item.id).join("|")]);
  useEffect(() => {
    if (!firebaseUser) return;
    const unreadRows = (view === "public" ? publicMessages : privateMessages).filter((message) => message.senderId !== firebaseUser.uid && !message.readBy?.includes(firebaseUser.uid));
    unreadRows.forEach((message) => void markChatMessageRead(view === "public" ? null : roomId, message, firebaseUser.uid, view === "public").catch(() => undefined));
  }, [firebaseUser, publicMessages, privateMessages, view, roomId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [activeMessages.length, view]);
  useEffect(() => {
    let active = true;
    const pending: string[] = [];
    activeMessages.forEach((message) => {
      if (message.filePath && !attachments[message.id]) pending.push(message.id);
    });
    if (!pending.length) return;
    for (const id of pending) {
      const item = activeMessages.find((message) => message.id === id);
      if (!item?.filePath) continue;
      void loadChatAttachment(item.filePath).then((blob) => {
        const url = URL.createObjectURL(blob);
        if (active) setAttachments((current) => ({ ...current, [id]: url })); else URL.revokeObjectURL(url);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [activeMessages, attachments]);

  const startPrivateChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!self) return;
    try {
      const target = await findChatUser(phoneLookup);
      const id = await openPrivateConversation(self, target);
      setRoomId(id); setView("private"); setPhoneLookup("");
    } catch (error: any) { toast.error(error?.message ?? "Mtumiaji hakupatikana."); }
  };
  const send = async (attachment?: { filePath: string; fileName: string; fileType: string }) => {
    if (!firebaseUser) return;
    try {
      await sendChatMessage(view === "private" ? roomId : null, firebaseUser.uid, draft, reply ?? undefined, view === "public", attachment);
      setDraft(""); setReply(null);
      if (view === "private") void setChatTyping(roomId, firebaseUser.uid, false).catch(() => undefined);
    } catch (error: any) { toast.error(error?.message ?? "Ujumbe haukutumwa."); }
  };
  const onFile = async (file?: File) => {
    if (!file || !firebaseUser) return;
    setFileBusy(true);
    try { const attachment = await uploadChatFile(view === "private" ? roomId : null, firebaseUser.uid, file, view === "public"); await send(attachment); }
    catch (error: any) { toast.error(error?.message ?? "Faili haikutumwa."); }
    finally { setFileBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const startVoiceNote = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast.error("Kivinjari hiki hakiwezi kurekodi voice message."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const file = new globalThis.File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        void onFile(file);
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; setRecording(false);
      };
      recorder.start(); mediaRecorder.current = recorder; setRecording(true);
    } catch { toast.error("Ruhusu matumizi ya microphone ili kurekodi ujumbe wa sauti."); }
  };
  const setTypingDraft = (value: string) => {
    setDraft(value);
    if (view !== "private" || !firebaseUser || !roomId) return;
    void setChatTyping(roomId, firebaseUser.uid, true).catch(() => undefined);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => void setChatTyping(roomId, firebaseUser.uid, false).catch(() => undefined), 1500);
  };
  const report = async () => {
    if (!firebaseUser || !otherUid || !roomId) return;
    const reason = window.prompt("Eleza kwa kifupi sababu ya kuripoti mtumiaji huyu:");
    if (!reason?.trim()) return;
    try { await reportChatUser(firebaseUser.uid, otherUid, roomId, reason); toast.success("Ripoti imetumwa kwa usimamizi."); }
    catch { toast.error("Imeshindikana kutuma ripoti."); }
  };
  const block = async () => {
    if (!firebaseUser || !otherUid || !window.confirm("Ukimzuia, hamtaweza kutumiana ujumbe mpya. Endelea?")) return;
    try { await blockChatUser(firebaseUser.uid, otherUid); toast.success("Mtumiaji amezuiwa."); }
    catch { toast.error("Imeshindikana kumzuia mtumiaji."); }
  };

  if (!isAuthenticated || !firebaseUser) return <main className="portal-main"><div className="page-heading"><div><span className="overline">Jumuiya</span><h1>CHAT</h1></div></div><section className="account-panel"><p>Ingia kwenye akaunti yako ili kutumia public na private chat.</p><Link className="button button--green" href="/">Rudi portal na uingie</Link></section></main>;

  return <main className="portal-main chat-page">
    <div className="page-heading"><div><span className="overline">Jumuiya ya $TEWARD TZ</span><h1>CHAT</h1><p>Jumuiya ya wazi na mazungumzo binafsi yaliyo salama.</p></div><span className="chat-online"><i /> Umeunganishwa</span></div>
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <div className="chat-tabs"><button className={view === "public" ? "active" : ""} onClick={() => setView("public")}><Users size={16}/> Public</button><button className={view === "private" ? "active" : ""} onClick={() => setView("private")}><MessageCircle size={16}/> Binafsi</button></div>
        {view === "private" && <form className="chat-start-form" onSubmit={startPrivateChat}><input value={phoneLookup} onChange={(event) => setPhoneLookup(event.target.value)} placeholder="Namba ya simu ya mtu" inputMode="tel"/><button aria-label="Tafuta" type="submit"><Send size={16}/></button></form>}
        {view === "public" ? <div className="chat-public-summary"><Users size={22}/><strong>Public Chat</strong><span>Ujumbe unaonekana kwa watumiaji wote walioingia.</span></div> : <div className="chat-contacts">{conversations.map((conversation) => { const other = conversation.participants.find((uid) => uid !== firebaseUser.uid) ?? ""; return <button key={conversation.id} className={`chat-contact ${roomId === conversation.id ? "active" : ""}`} onClick={() => setRoomId(conversation.id)}><span className="chat-avatar">{(conversation.names?.[other] ?? "M").slice(0, 1).toUpperCase()}</span><span className="chat-contact-copy"><strong>{conversation.names?.[other] ?? "Mwanachama"}</strong><small>{conversation.lastMessage || "Mazungumzo yameanza"}</small></span>{unread[conversation.id] > 0 && <b className="chat-unread">{unread[conversation.id]}</b>}</button>; })}{!conversations.length && <p className="chat-empty">Tafuta namba ya simu ili kuanza mazungumzo binafsi.</p>}</div>}
      </aside>
      <section className="chat-main">
        <header className="chat-room-head"><div className="chat-room-title"><span className="chat-avatar">{view === "public" ? <Users size={20}/> : (otherUser?.name ?? "M").slice(0,1).toUpperCase()}</span><div><strong>{view === "public" ? "Public Chat" : otherUser?.name ?? "Chagua mazungumzo"}</strong><small>{view === "public" ? "Watu wote walioingia wanaweza kuona ujumbe" : presence?.online ? "Online" : presence?.lastSeen ? `Last seen ${dateLabel(presence.lastSeen)}` : "Offline"}</small></div></div>{view === "private" && otherUid && <div className="chat-safety-actions"><button title="Ripoti" onClick={() => void report()}><ShieldAlert size={17}/></button><button title="Zuia" onClick={() => void block()}><Ban size={17}/></button></div>}</header>
        <div className="chat-message-list" ref={scrollRef}>
          {view === "private" && !roomId ? <div className="chat-empty-state"><MessageCircle size={36}/><strong>Chagua mazungumzo</strong><span>Au tafuta mtumiaji kwa namba yake ya simu.</span></div> : activeMessages.map((message) => { const own = message.senderId === firebaseUser.uid; const isImage = message.fileType?.startsWith("image/"); const isAudio = message.fileType?.startsWith("audio/"); return <article key={message.id} className={`chat-bubble ${own ? "own" : ""}`}><small className="chat-sender">{own ? "Wewe" : view === "public" ? "Mwanachama" : otherUser?.name ?? "Mwanachama"}</small>{message.replyTo && <div className="chat-reply-preview">↪ {message.replyTo.text}</div>}{message.text && <p>{message.text}</p>}{message.filePath && attachments[message.id] && (isImage ? <a href={attachments[message.id]} target="_blank" rel="noreferrer"><img className="chat-image" src={attachments[message.id]} alt={message.fileName ?? "Picha iliyotumwa"}/></a> : isAudio ? <audio controls src={attachments[message.id]}/> : <a className="chat-file" href={attachments[message.id]} download={message.fileName}><File size={16}/>{message.fileName ?? "Faili"}</a>)}<footer><time>{dateLabel(message.createdAt)}</time>{own && <span title={message.readBy?.some((uid) => uid !== firebaseUser.uid) ? "Imesomwa" : message.deliveredTo?.some((uid) => uid !== firebaseUser.uid) ? "Imefika" : "Imetumwa"}>{message.readBy?.some((uid) => uid !== firebaseUser.uid) ? <CheckCheck size={14}/> : message.deliveredTo?.some((uid) => uid !== firebaseUser.uid) ? <CheckCheck size={14}/> : <Check size={14}/>}</span>}<button aria-label="Jibu" onClick={() => setReply(message)}><Reply size={14}/></button></footer></article>; })}
          {view === "private" && typing.some((uid) => uid !== firebaseUser.uid) && <div className="chat-typing">Mwanachama anaandika…</div>}
        </div>
        {reply && <div className="chat-reply-bar"><Reply size={16}/><span>Unajibu: {reply.text ?? reply.fileName ?? "Kiambatisho"}</span><button onClick={() => setReply(null)}><X size={16}/></button></div>}
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><input ref={fileRef} type="file" hidden onChange={(event) => void onFile(event.target.files?.[0])}/><button type="button" title="Ambatisha picha/faili" onClick={() => fileRef.current?.click()} disabled={fileBusy}><Paperclip size={19}/></button><button type="button" title="Emoji" onClick={() => setDraft((value) => value + emojis[0])}><Smile size={19}/></button><input value={draft} onChange={(event) => setTypingDraft(event.target.value)} placeholder={view === "private" && !roomId ? "Chagua mazungumzo kwanza" : "Andika ujumbe…"} disabled={view === "private" && !roomId}/><div className="chat-composer-actions"><button type="button" title={recording ? "Simamisha kurekodi" : "Rekodi voice message"} onClick={() => recording ? mediaRecorder.current?.stop() : void startVoiceNote()}>{recording ? <StopCircle size={19}/> : <Mic size={19}/>}</button><button type="submit" title="Tuma ujumbe" disabled={fileBusy || (!draft.trim() && !recording)}><Send size={18}/></button></div></form>
        <div className="chat-emoji-row">{emojis.map((emoji) => <button type="button" key={emoji} onClick={() => setDraft((value) => value + emoji)}>{emoji}</button>)}{fileBusy && <small>Inatuma faili…</small>}</div>
      </section>
    </div>
    <p className="chat-call-notice">Voice/video calls hazijawezeshwa bado; kwa hiyo hakuna vitufe vya simu bandia kwenye ukurasa huu.</p>
  </main>;
}
