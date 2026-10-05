import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Ban, Check, CheckCheck, File, LoaderCircle, MessageCircle, Mic, Paperclip, Pencil, Reply, Search, Send, ShieldAlert, Smile, StopCircle, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { blockChatUser, deleteChatMessage, editChatMessage, findChatUser, loadChatAttachment, markChatMessageRead, openPrivateConversation, reportChatUser, sendChatMessage, setChatTyping, subscribeAllConversations, subscribeConversations, subscribePresence, subscribePrivateChat, subscribePublicChat, subscribeTyping, updatePresence, uploadChatFile, type ChatMessage, type ChatUser, type PrivateConversation } from "@/lib/firebase";
import "./chat.css";

const emojis = ["😀", "😂", "🥰", "😍", "👍", "🙏", "❤️", "🎉", "😢", "🔥"];
function dateLabel(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") return (value as any).toDate().toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" });
  return "";
}
function errorMessage(error: any, fallback: string) {
  if (error?.code === "permission-denied") return "Ruhusa ya Chat imekataliwa na Firebase. Hakikisha sheria za Firestore na Storage zimechapishwa.";
  if (error?.code === "unauthenticated") return "Kipindi chako kimeisha. Ingia tena kisha ujaribu.";
  return error?.message || fallback;
}
function initials(name?: string) { return (name?.trim() || "M").slice(0, 1).toUpperCase(); }

export default function ChatPage() {
  const { firebaseUser, profile, user, isAuthenticated } = useAuth();
  const canModerate = Boolean(user?.role === "super_admin" || user?.permissions?.manageMessages);
  const [view, setView] = useState<"public" | "private" | "moderation">("public");
  const [publicMessages, setPublicMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [moderationConversations, setModerationConversations] = useState<PrivateConversation[]>([]);
  const [privateMessages, setPrivateMessages] = useState<ChatMessage[]>([]);
  const [roomId, setRoomId] = useState("");
  const [draft, setDraft] = useState("");
  const [phoneLookup, setPhoneLookup] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen?: unknown } | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [fileBusy, setFileBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [publicError, setPublicError] = useState("");
  const [conversationError, setConversationError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);

  const self: ChatUser | null = firebaseUser ? { uid: firebaseUser.uid, name: profile?.name ?? firebaseUser.displayName ?? "Mwanachama", phone: profile?.phone ?? "" } : null;
  const personalConversation = conversations.find((item) => item.id === roomId);
  const moderationConversation = moderationConversations.find((item) => item.id === roomId);
  const currentConversation = view === "moderation" ? moderationConversation : personalConversation;
  const otherUid = view === "private" ? currentConversation?.participants.find((uid) => uid !== firebaseUser?.uid) ?? "" : "";
  const otherUser = currentConversation && otherUid ? { uid: otherUid, name: currentConversation.names?.[otherUid] ?? "Mwanachama", phone: currentConversation.phones?.[otherUid] ?? "" } : null;
  const activeMessages = view === "public" ? publicMessages : privateMessages;
  const visibleConversations = view === "moderation" ? moderationConversations : conversations;
  const filteredConversations = useMemo(() => {
    const needle = contactSearch.trim().toLocaleLowerCase();
    if (!needle) return visibleConversations;
    return visibleConversations.filter((conversation) => {
      const other = view === "moderation" ? conversation.participants.map((id) => conversation.names?.[id] ?? id).join(" ") : conversation.names?.[conversation.participants.find((id) => id !== firebaseUser?.uid) ?? ""] ?? "";
      return `${other} ${conversation.lastMessage ?? ""}`.toLocaleLowerCase().includes(needle);
    });
  }, [visibleConversations, contactSearch, view, firebaseUser?.uid]);

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
    setLoadingPublic(true); setPublicError("");
    return subscribePublicChat((rows) => { setPublicMessages(rows); setLoadingPublic(false); }, (error) => { setPublicError(errorMessage(error, "Imeshindikana kupakia public chat.")); setLoadingPublic(false); });
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingConversations(true); setConversationError("");
    return subscribeConversations(firebaseUser.uid, (rows) => { setConversations(rows); setLoadingConversations(false); }, (error) => { setConversationError(errorMessage(error, "Imeshindikana kupakia mazungumzo.")); setLoadingConversations(false); });
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser || !canModerate || view !== "moderation") { setModerationConversations([]); return; }
    setLoadingConversations(true); setConversationError("");
    return subscribeAllConversations((rows) => { setModerationConversations(rows); setLoadingConversations(false); }, (error) => { setConversationError(errorMessage(error, "Imeshindikana kupakia mazungumzo ya moderation.")); setLoadingConversations(false); });
  }, [firebaseUser, canModerate, view]);
  useEffect(() => {
    if (!firebaseUser || !roomId || (view !== "private" && view !== "moderation")) {
      setPrivateMessages([]); setTyping([]); setPresence(null); setLoadingMessages(false); setMessageError(""); return;
    }
    setLoadingMessages(true); setMessageError("");
    const stopMessages = subscribePrivateChat(roomId, (rows) => { setPrivateMessages(rows); setLoadingMessages(false); }, (error) => { setMessageError(errorMessage(error, "Imeshindikana kupakia ujumbe binafsi.")); setLoadingMessages(false); });
    const stopTyping = view === "private" ? subscribeTyping(roomId, setTyping, () => undefined) : () => {};
    const stopPresence = view === "private" && otherUid ? subscribePresence(otherUid, setPresence) : () => {};
    return () => { stopMessages(); stopTyping(); stopPresence(); };
  }, [firebaseUser, roomId, otherUid, view]);
  useEffect(() => {
    if (!firebaseUser || view === "moderation") return;
    const stops = conversations.map((conversation) => subscribePrivateChat(conversation.id, (rows) => {
      const count = rows.filter((message) => message.senderId !== firebaseUser.uid && !message.readBy?.includes(firebaseUser.uid)).length;
      setUnread((previous) => ({ ...previous, [conversation.id]: count }));
    }, () => undefined));
    return () => stops.forEach((stop) => stop());
  }, [firebaseUser, conversations.map((item) => item.id).join("|") , view]);
  useEffect(() => {
    if (!firebaseUser || view === "moderation") return;
    const unreadRows = (view === "public" ? publicMessages : privateMessages).filter((message) => message.senderId !== firebaseUser.uid && !message.readBy?.includes(firebaseUser.uid));
    unreadRows.forEach((message) => void markChatMessageRead(view === "public" ? null : roomId, message, firebaseUser.uid, view === "public").catch(() => undefined));
  }, [firebaseUser, publicMessages, privateMessages, view, roomId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [activeMessages.length, view]);
  useEffect(() => {
    let active = true;
    const pending = activeMessages.filter((message) => message.filePath && !attachments[message.id]);
    for (const message of pending) {
      if (!message.filePath) continue;
      void loadChatAttachment(message.filePath).then((blob) => {
        const url = URL.createObjectURL(blob);
        if (active) setAttachments((current) => ({ ...current, [message.id]: url })); else URL.revokeObjectURL(url);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [activeMessages, attachments]);
  useEffect(() => () => {
    Object.values(attachments).forEach((url) => URL.revokeObjectURL(url));
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startPrivateChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!self) return;
    try {
      const target = await findChatUser(phoneLookup);
      const id = await openPrivateConversation(self, target);
      setRoomId(id); setView("private"); setPhoneLookup(""); setMessageError("");
    } catch (error: any) { toast.error(errorMessage(error, "Mtumiaji hakupatikana.")); }
  };
  const send = async (attachment?: { filePath: string; fileName: string; fileType: string }) => {
    if (!firebaseUser || sending || (view !== "public" && !roomId)) return;
    setSending(true);
    try {
      await sendChatMessage(view === "public" ? null : roomId, firebaseUser.uid, draft, reply ?? undefined, view === "public", attachment, self?.name);
      setDraft(""); setReply(null);
      if (view === "private") void setChatTyping(roomId, firebaseUser.uid, false).catch(() => undefined);
    } catch (error: any) { toast.error(errorMessage(error, "Ujumbe haukutumwa.")); }
    finally { setSending(false); }
  };
  const onFile = async (file?: File) => {
    if (!file || !firebaseUser || (view !== "public" && !roomId)) return;
    setFileBusy(true);
    try { const attachment = await uploadChatFile(view === "public" ? null : roomId, firebaseUser.uid, file, view === "public"); await send(attachment); }
    catch (error: any) { toast.error(errorMessage(error, "Faili haikutumwa.")); }
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
    catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kutuma ripoti.")); }
  };
  const block = async () => {
    if (!firebaseUser || !otherUid || !window.confirm("Ukimzuia, hamtaweza kutumiana ujumbe mpya. Endelea?")) return;
    try { await blockChatUser(firebaseUser.uid, otherUid); toast.success("Mtumiaji amezuiwa."); }
    catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kumzuia mtumiaji.")); }
  };
  const saveEdit = async (message: ChatMessage) => {
    try { await editChatMessage(view === "public" ? null : roomId, message, editDraft, view === "public"); setEditingId(""); setEditDraft(""); }
    catch (error: any) { toast.error(errorMessage(error, "Ujumbe haukuhaririwa.")); }
  };
  const removeMessage = async (message: ChatMessage) => {
    const scope = view === "moderation" ? "kwenye mazungumzo haya" : "kwenye Chat";
    if (!window.confirm(`Futa ujumbe huu ${scope}? Huwezi kuurudisha.`)) return;
    try { await deleteChatMessage(view === "public" ? null : roomId, message, view === "public"); toast.success("Ujumbe umefutwa."); }
    catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kufuta ujumbe.")); }
  };

  if (!isAuthenticated || !firebaseUser) return <main className="portal-main chat-page"><div className="chat-login-card"><span className="chat-section-mark"><MessageCircle size={22}/></span><h1>Chat ya jumuiya</h1><p>Ingia ili uungane na jumuiya, utume ujumbe na kuzungumza binafsi.</p><Link className="button button--green" href="/">Rudi portal na uingie</Link></div></main>;

  const roomTitle = view === "public" ? "Public chat" : view === "moderation" ? (currentConversation ? currentConversation.participants.map((id) => currentConversation.names?.[id] ?? id).join("  ·  ") : "Chagua mazungumzo") : otherUser?.name ?? "Chagua mazungumzo";
  const roomSubtitle = view === "public" ? "Jumuiya nzima inaweza kushiriki" : view === "moderation" ? "Mwonekano wa msimamizi · mazungumzo binafsi" : presence?.online ? "Yupo mtandaoni" : presence?.lastSeen ? `Mara ya mwisho ${dateLabel(presence.lastSeen)}` : "Hayupo mtandaoni";
  const roomError = view === "public" ? publicError : messageError;
  const loading = view === "public" ? loadingPublic : loadingMessages;

  return <main className="portal-main chat-page">
    <header className="chat-page-head"><div><span className="overline">JUMUIYA YA $TEWARD TZ</span><h1>Ujumbe na mazungumzo</h1><p>Shiriki mawazo, tuma faili au zungumza moja kwa moja.</p></div><div className="chat-connection"><i/> Imeunganishwa</div></header>
    <section className="chat-workspace">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-heading"><div><span className="chat-section-mark"><MessageCircle size={18}/></span><strong>Ujumbe</strong></div><span className="chat-total-count">{view === "moderation" ? moderationConversations.length : conversations.length}</span></div>
        <nav className="chat-tabs" aria-label="Aina ya mazungumzo">
          <button className={view === "public" ? "active" : ""} onClick={() => { setView("public"); setRoomId(""); setContactSearch(""); }}><Users size={16}/> Jumuiya</button>
          <button className={view === "private" ? "active" : ""} onClick={() => { setView("private"); setContactSearch(""); }}><MessageCircle size={16}/> Binafsi</button>
          {canModerate && <button className={view === "moderation" ? "active" : ""} onClick={() => { setView("moderation"); setRoomId(""); setContactSearch(""); }}><ShieldAlert size={16}/> Usimamizi</button>}
        </nav>
        {view === "public" ? <div className="chat-public-card"><div className="chat-avatar chat-avatar--large"><Users size={20}/></div><strong>Jumuiya ya wazi</strong><span>Ujumbe hapa unaonekana kwa kila mtu aliyeingia.</span><div className="chat-public-pulse"><i/> Mazungumzo yanaendelea</div></div> : <>
          {view === "private" && <form className="chat-start-form" onSubmit={startPrivateChat}><label htmlFor="chat-phone">Anzisha mazungumzo</label><div><input id="chat-phone" value={phoneLookup} onChange={(event) => setPhoneLookup(event.target.value)} placeholder="Namba ya simu" inputMode="tel"/><button aria-label="Tafuta mtumiaji" type="submit"><Send size={16}/></button></div></form>}
          <label className="chat-contact-search"><Search size={16}/><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder={view === "moderation" ? "Tafuta mazungumzo" : "Tafuta mazungumzo"}/></label>
          <div className="chat-contacts">
            {loadingConversations && <div className="chat-list-hint"><LoaderCircle className="chat-spin" size={17}/> Inapakia mazungumzo…</div>}
            {conversationError && <div className="chat-inline-error">{conversationError}<button onClick={() => window.location.reload()}>Jaribu tena</button></div>}
            {!loadingConversations && !conversationError && filteredConversations.map((conversation) => {
              const other = conversation.participants.find((uid) => uid !== firebaseUser.uid) ?? "";
              const name = view === "moderation" ? conversation.participants.map((id) => conversation.names?.[id] ?? id).join(" · ") : conversation.names?.[other] ?? "Mwanachama";
              const subtitle = view === "moderation" ? conversation.lastMessage || "Mazungumzo binafsi" : conversation.lastMessage || "Mazungumzo yameanza";
              return <button key={conversation.id} className={`chat-contact ${roomId === conversation.id ? "active" : ""}`} onClick={() => { setRoomId(conversation.id); setMessageError(""); }}><span className="chat-avatar">{initials(name)}</span><span className="chat-contact-copy"><strong>{name}</strong><small>{subtitle}</small></span>{view === "private" && unread[conversation.id] > 0 && <b className="chat-unread">{unread[conversation.id]}</b>}</button>;
            })}
            {!loadingConversations && !conversationError && filteredConversations.length === 0 && <p className="chat-empty">{view === "moderation" ? "Bado hakuna mazungumzo ya kusimamia." : "Tafuta namba ya simu ili kuanza mazungumzo."}</p>}
          </div>
        </>}
        {view === "moderation" && <div className="chat-moderation-note"><ShieldAlert size={15}/> Ufikiaji wa moderation umewekewa role yenye ruhusa ya kusimamia ujumbe.</div>}
      </aside>
      <section className="chat-main">
        <header className="chat-room-head"><div className="chat-room-title"><span className="chat-avatar">{view === "public" ? <Users size={18}/> : initials(roomTitle)}</span><div><strong>{roomTitle}</strong><small>{roomSubtitle}</small></div></div>{view === "private" && otherUid && <div className="chat-safety-actions"><button title="Ripoti" onClick={() => void report()}><ShieldAlert size={17}/></button><button title="Zuia" onClick={() => void block()}><Ban size={17}/></button></div>}{view === "moderation" && <span className="chat-admin-badge">MODERATION</span>}</header>
        <div className="chat-message-list" ref={scrollRef}>
          {view !== "public" && !roomId ? <div className="chat-empty-state"><span className="chat-section-mark"><MessageCircle size={22}/></span><strong>{view === "moderation" ? "Chagua mazungumzo" : "Anza mazungumzo binafsi"}</strong><span>{view === "moderation" ? "Chagua mazungumzo ili kuona na kusimamia ujumbe." : "Tafuta kwa namba ya simu au chagua mazungumzo yaliyopo."}</span></div> : loading ? <div className="chat-empty-state"><LoaderCircle className="chat-spin" size={25}/><span>Inapakia ujumbe…</span></div> : roomError ? <div className="chat-empty-state chat-empty-state--error"><ShieldAlert size={28}/><strong>Chat haikupakia</strong><span>{roomError}</span></div> : activeMessages.length === 0 ? <div className="chat-empty-state"><span className="chat-section-mark"><MessageCircle size={22}/></span><strong>Hakuna ujumbe bado</strong><span>Anza mazungumzo kwa kutuma ujumbe wa kwanza.</span></div> : activeMessages.map((message) => {
            const own = message.senderId === firebaseUser.uid;
            const senderName = own ? "Wewe" : (view === "moderation" ? currentConversation?.names?.[message.senderId] : view === "private" ? currentConversation?.names?.[message.senderId] : message.senderName) ?? "Mwanachama";
            const isImage = message.fileType?.startsWith("image/");
            const isAudio = message.fileType?.startsWith("audio/");
            const canEdit = own && Boolean(message.text) && view !== "moderation";
            const canDelete = own || (view === "moderation" && canModerate) || (view === "public" && canModerate);
            return <article key={message.id} className={`chat-message-row ${own ? "own" : ""}`}>
              <span className="chat-avatar chat-message-avatar">{initials(senderName)}</span>
              <div className="chat-bubble-wrap"><small className="chat-sender">{senderName}</small><div className={`chat-bubble ${own ? "own" : ""}`}>
                {message.replyTo && <div className="chat-reply-preview">↪ {message.replyTo.text}</div>}
                {editingId === message.id ? <div className="chat-edit-box"><textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={5000}/><div><button onClick={() => { setEditingId(""); setEditDraft(""); }}>Ghairi</button><button className="primary" onClick={() => void saveEdit(message)}>Hifadhi</button></div></div> : message.text && <p>{message.text}</p>}
                {message.filePath && attachments[message.id] && (isImage ? <a href={attachments[message.id]} target="_blank" rel="noreferrer"><img className="chat-image" src={attachments[message.id]} alt={message.fileName ?? "Picha iliyotumwa"}/></a> : isAudio ? <audio controls src={attachments[message.id]}/> : <a className="chat-file" href={attachments[message.id]} download={message.fileName}><File size={16}/>{message.fileName ?? "Faili"}</a>)}
                {message.filePath && !attachments[message.id] && <span className="chat-file-pending"><File size={15}/> Inapakia kiambatisho…</span>}
                <footer><time>{dateLabel(message.createdAt)}{message.editedAt ? " · imehaririwa" : ""}</time>{own && view !== "moderation" && <span className="chat-receipt" title={message.readBy?.some((uid) => uid !== firebaseUser.uid) ? "Imesomwa" : message.deliveredTo?.some((uid) => uid !== firebaseUser.uid) ? "Imefika" : "Imetumwa"}>{message.readBy?.some((uid) => uid !== firebaseUser.uid) ? <CheckCheck size={14}/> : message.deliveredTo?.some((uid) => uid !== firebaseUser.uid) ? <CheckCheck size={14}/> : <Check size={14}/>}</span>}
                  {canEdit && <button title="Hariri ujumbe" aria-label="Hariri ujumbe" onClick={() => { setEditingId(message.id); setEditDraft(message.text ?? ""); }}><Pencil size={14}/></button>}
                  {view !== "moderation" && !own && <button title="Jibu" aria-label="Jibu" onClick={() => setReply(message)}><Reply size={14}/></button>}
                  {canDelete && <button className="chat-delete-action" title={canModerate && !own ? "Futa ujumbe huu kama moderator" : "Futa ujumbe wangu"} aria-label="Futa ujumbe" onClick={() => void removeMessage(message)}><Trash2 size={14}/></button>}
                </footer>
              </div></div>
            </article>;
          })}
          {view === "private" && typing.some((uid) => uid !== firebaseUser.uid) && <div className="chat-typing">Mwanachama anaandika…</div>}
        </div>
        {reply && <div className="chat-reply-bar"><Reply size={16}/><span>Unajibu: {reply.text ?? reply.fileName ?? "Kiambatisho"}</span><button onClick={() => setReply(null)}><X size={16}/></button></div>}
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><input ref={fileRef} type="file" hidden onChange={(event) => void onFile(event.target.files?.[0])}/><button type="button" title="Ambatisha picha/faili" onClick={() => fileRef.current?.click()} disabled={fileBusy || (view !== "public" && !roomId)}><Paperclip size={18}/></button><button type="button" title="Ongeza emoji" onClick={() => setDraft((value) => value + emojis[0])} disabled={view !== "public" && !roomId}><Smile size={18}/></button><input value={draft} onChange={(event) => setTypingDraft(event.target.value)} placeholder={view === "public" ? "Andika ujumbe wa jumuiya…" : view === "moderation" ? "Moderation ni ya kusoma na kusimamia ujumbe tu" : roomId ? "Andika ujumbe…" : "Chagua mazungumzo kwanza"} disabled={(view !== "public" && !roomId) || view === "moderation"}/><div className="chat-composer-actions">{view !== "moderation" && <button type="button" title={recording ? "Simamisha kurekodi" : "Rekodi voice message"} onClick={() => recording ? mediaRecorder.current?.stop() : void startVoiceNote()} disabled={view === "private" && !roomId}>{recording ? <StopCircle size={18}/> : <Mic size={18}/>}</button>}<button className="chat-send-button" type="submit" title="Tuma ujumbe" disabled={fileBusy || sending || view === "moderation" || (view === "private" && !roomId) || (!draft.trim() && !recording)}>{sending ? <LoaderCircle className="chat-spin" size={18}/> : <Send size={18}/>}</button></div></form>
        <div className="chat-emoji-row">{emojis.map((emoji) => <button type="button" key={emoji} onClick={() => setDraft((value) => value + emoji)} disabled={view === "moderation"}>{emoji}</button>)}{fileBusy && <small>Inatuma faili…</small>}</div>
      </section>
    </section>
    <p className="chat-call-notice">Voice/video calls bado hazijatekelezwa, kwa hiyo hakuna vitufe vya simu visivyofanya kazi.</p>
  </main>;
}
