import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Ban, Check, CheckCheck, ChevronDown, Eye, File, HardDrive, LoaderCircle, MessageCircle, Mic, Paperclip, Pencil, Reply, Search, Send, Settings, ShieldAlert, Smile, StopCircle, Trash2, Users, Video, Volume2, X, Camera, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { blockChatUser, createChatGroup, deleteChatMessage, editChatMessage, findChatUser, loadChatAttachment, markChatMessageRead, openPrivateConversation, reportChatUser, sendChatMessage, sendGroupChatMessage, setChatTyping, subscribeAllConversations, subscribeChatGroups, subscribeGroupChat, subscribePublicChatGroups, subscribeGroupJoinRequests, requestToJoinChatGroup, approveChatGroupJoinRequest, subscribeChatMembers, subscribeConversations, subscribePresence, subscribePrivateChat, subscribePublicChat, subscribeTyping, updatePresence, uploadChatFile, uploadChatGroupAvatar, updateChatGroupSettings, type ChatGroup, type ChatGroupJoinRequest, type ChatMessage, type ChatUser, type PrivateConversation } from "@/lib/firebase";
import "./chat.css";
import ChatSettings from "./ChatSettings";

const emojis = ["😀", "😂", "🥰", "😍", "😎", "🤝", "👍", "👏", "🙏", "❤️", "💚", "🎉", "🔥", "✅", "💪", "😢", "😡", "🤔", "🥳", "⭐", "📌", "💡", "🚀", "🙌"];
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
  const mediaReady = import.meta.env.VITE_FIREBASE_STORAGE_READY === "true";
  const canModerate = Boolean(user?.role === "super_admin" || user?.permissions?.manageMessages);
  const [view, setView] = useState<"all" | "public" | "private" | "groups" | "moderation">("all");
  const [listCategory, setListCategory] = useState<"all" | "public" | "private" | "groups" | "moderation">("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [members, setMembers] = useState<ChatUser[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [chatTheme, setChatTheme] = useState<"light" | "dark" | "green">(() => { try { return (localStorage.getItem("sstz-chat-theme") as "light" | "dark" | "green") || "green"; } catch { return "green"; } });
  const [compactChat, setCompactChat] = useState(() => { try { return localStorage.getItem("sstz-chat-compact") === "true"; } catch { return false; } });
  const [showMessagePreview, setShowMessagePreview] = useState(() => { try { return localStorage.getItem("sstz-chat-preview") !== "false"; } catch { return true; } });
  const [chatFilter, setChatFilter] = useState<"all" | "unread">("all");
  const [soundEnabled, setSoundEnabled] = useState(() => { try { return localStorage.getItem("sstz-chat-sound") !== "false"; } catch { return true; } });
  const [desktopAlerts, setDesktopAlerts] = useState(() => { try { return localStorage.getItem("sstz-chat-desktop-alerts") === "true"; } catch { return false; } });
  const [showLastSeen, setShowLastSeen] = useState(() => { try { return localStorage.getItem("sstz-chat-last-seen") !== "false"; } catch { return true; } });
  const [readReceipts, setReadReceipts] = useState(() => { try { return localStorage.getItem("sstz-chat-read-receipts") !== "false"; } catch { return true; } });
  const previousMessageCount = useRef(0);
  useEffect(() => { try { localStorage.setItem("sstz-chat-sound", String(soundEnabled)); } catch {} }, [soundEnabled]);
  useEffect(() => { try { localStorage.setItem("sstz-chat-desktop-alerts", String(desktopAlerts)); } catch {} }, [desktopAlerts]);
  useEffect(() => { try { localStorage.setItem("sstz-chat-last-seen", String(showLastSeen)); } catch {} }, [showLastSeen]);
  useEffect(() => { try { localStorage.setItem("sstz-chat-read-receipts", String(readReceipts)); } catch {} }, [readReceipts]);


  useEffect(() => { try { localStorage.setItem("sstz-chat-theme", chatTheme); } catch {} }, [chatTheme]);
  useEffect(() => { try { localStorage.setItem("sstz-chat-compact", String(compactChat)); } catch {} }, [compactChat]);
  useEffect(() => { try { localStorage.setItem("sstz-chat-preview", String(showMessagePreview)); } catch {} }, [showMessagePreview]);
  const [publicMessages, setPublicMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [publicGroups, setPublicGroups] = useState<ChatGroup[]>([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState<ChatGroupJoinRequest[]>([]);
  const [groupVisibility, setGroupVisibility] = useState<"private" | "public">("private");
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupPhones, setGroupPhones] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupModalOpen, setGroupModalOpen] = useState(false);\n  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);\n  const [groupSettingsName, setGroupSettingsName] = useState("");\n  const [groupSettingsDescription, setGroupSettingsDescription] = useState("");\n  const [groupSettingsVisibility, setGroupSettingsVisibility] = useState<"private" | "public">("private");\n  const [groupAvatarBusy, setGroupAvatarBusy] = useState(false);\n  const groupAvatarRef = useRef<HTMLInputElement>(null);
  const [moderationConversations, setModerationConversations] = useState<PrivateConversation[]>([]);
  const [privateMessages, setPrivateMessages] = useState<ChatMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChatMessage[]>([]);
  const [roomId, setRoomId] = useState("");
  const [draft, setDraft] = useState("");
  const [phoneLookup, setPhoneLookup] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen?: unknown } | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [fileBusy, setFileBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
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

  const self: ChatUser | null = firebaseUser ? { uid: firebaseUser.uid, name: profile?.name ?? firebaseUser.displayName ?? "Mwanachama", phone: profile?.phone ?? "", profileImageUrl: profile?.profileImageUrl, verificationStatus: profile?.verificationStatus } : null;
  const personalConversation = conversations.find((item) => item.id === roomId);
  const moderationConversation = moderationConversations.find((item) => item.id === roomId);
  const currentConversation = view === "moderation" ? moderationConversation : personalConversation;
  const currentGroup = groups.find((item) => item.id === groupId);
  const otherUid = view === "private" ? currentConversation?.participants.find((uid) => uid !== firebaseUser?.uid) ?? "" : "";
  const otherUser = currentConversation && otherUid ? { uid: otherUid, name: currentConversation.names?.[otherUid] ?? "Mwanachama", phone: currentConversation.phones?.[otherUid] ?? "", profileImageUrl: currentConversation.profileImages?.[otherUid] } : null;
  const activeMessages = view === "public" ? publicMessages : view === "groups" ? groupMessages : privateMessages;
  useEffect(() => {
    if (previousMessageCount.current && activeMessages.length > previousMessageCount.current) {
      const latest = activeMessages[activeMessages.length - 1];
      if (latest && latest.senderId !== firebaseUser?.uid) {
        if (soundEnabled) { try { const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext; if (AudioContextClass) { const ctx = new AudioContextClass(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = 740; gain.gain.value = 0.035; oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.09); oscillator.onended = () => void ctx.close(); } } catch {} }
        if (desktopAlerts && document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") new Notification(latest.senderName || "Ujumbe mpya", { body: latest.text || "Ametuma kiambatisho kipya." });
      }
    }
    previousMessageCount.current = activeMessages.length;
  }, [activeMessages, soundEnabled, desktopAlerts, firebaseUser?.uid]);
  const filteredMessages = useMemo(() => {
    const needle = messageSearch.trim().toLocaleLowerCase();
    if (!needle) return activeMessages;
    return activeMessages.filter((message) => `${message.text ?? ""} ${message.fileName ?? ""} ${message.senderName ?? ""}`.toLocaleLowerCase().includes(needle));
  }, [activeMessages, messageSearch]);
  const visibleConversations = view === "moderation" ? moderationConversations : conversations;
  const filteredConversations = useMemo(() => {
    const needle = contactSearch.trim().toLocaleLowerCase();
    if (!needle) return visibleConversations;
    return visibleConversations.filter((conversation) => {
      const other = view === "moderation" ? conversation.participants.map((id) => conversation.names?.[id] ?? id).join(" ") : conversation.names?.[conversation.participants.find((id) => id !== firebaseUser?.uid) ?? ""] ?? "";
      return `${other} ${conversation.lastMessage ?? ""}`.toLocaleLowerCase().includes(needle);
    });
  }, [visibleConversations, contactSearch, view, firebaseUser?.uid]);
  const displayedConversations = filteredConversations.filter((conversation) => chatFilter === "all" || (unread[conversation.id] ?? 0) > 0);

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
    if (!firebaseUser) { setMembers([]); return; }
    return subscribeChatMembers((rows) => setMembers(rows.filter((member) => member.uid !== firebaseUser.uid)), () => setMembers([]));
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser) { setGroups([]); return; }
    return subscribeChatGroups(firebaseUser.uid, setGroups, (error) => setConversationError(errorMessage(error, "Imeshindikana kupakia magroup.")));
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser || !canModerate || view !== "moderation") { setModerationConversations([]); return; }
    setLoadingConversations(true); setConversationError("");
    return subscribeAllConversations((rows) => { setModerationConversations(rows); setLoadingConversations(false); }, (error) => { setConversationError(errorMessage(error, "Imeshindikana kupakia mazungumzo ya moderation.")); setLoadingConversations(false); });
  }, [firebaseUser, canModerate, view]);
  useEffect(() => {
    if (!firebaseUser || (!roomId && !groupId) || (view !== "private" && view !== "moderation" && view !== "groups")) {
      setPrivateMessages([]); setGroupMessages([]); setTyping([]); setPresence(null); setLoadingMessages(false); setMessageError(""); return;
    }
    setLoadingMessages(true); setMessageError("");
    const stopMessages = view === "groups"
      ? subscribeGroupChat(groupId, (rows) => { setGroupMessages(rows); setLoadingMessages(false); }, (error) => { setMessageError(errorMessage(error, "Imeshindikana kupakia ujumbe wa group.")); setLoadingMessages(false); })
      : subscribePrivateChat(roomId, (rows) => { setPrivateMessages(rows); setLoadingMessages(false); }, (error) => { setMessageError(errorMessage(error, "Imeshindikana kupakia ujumbe binafsi.")); setLoadingMessages(false); });
    const stopTyping = view === "private" ? subscribeTyping(roomId, setTyping, () => undefined) : () => {};
    const stopPresence = view === "private" && otherUid ? subscribePresence(otherUid, setPresence) : () => {};
    return () => { stopMessages(); stopTyping(); stopPresence(); };
  }, [firebaseUser, roomId, groupId, otherUid, view]);
  useEffect(() => {
    if (!firebaseUser || view === "moderation" || view === "groups") return;
    const stops = conversations.map((conversation) => subscribePrivateChat(conversation.id, (rows) => {
      const count = rows.filter((message) => message.senderId !== firebaseUser.uid && !message.readBy?.includes(firebaseUser.uid)).length;
      setUnread((previous) => ({ ...previous, [conversation.id]: count }));
    }, () => undefined));
    return () => stops.forEach((stop) => stop());
  }, [firebaseUser, conversations.map((item) => item.id).join("|") , view]);
  useEffect(() => {
    if (!firebaseUser || view === "moderation" || !readReceipts) return;
    const unreadRows = (view === "public" ? publicMessages : privateMessages).filter((message) => message.senderId !== firebaseUser.uid && !message.readBy?.includes(firebaseUser.uid));
    unreadRows.forEach((message) => void markChatMessageRead(view === "public" ? null : roomId, message, firebaseUser.uid, view === "public").catch(() => undefined));
  }, [firebaseUser, publicMessages, privateMessages, view, roomId, readReceipts]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [activeMessages.length, view]);
  useEffect(() => {
    let active = true;
    const pending = mediaReady ? activeMessages.filter((message) => message.filePath && !attachments[message.id]) : [];
    for (const message of pending) {
      if (!message.filePath) continue;
      void loadChatAttachment(message.filePath).then((blob) => {
        const url = URL.createObjectURL(blob);
        if (active) setAttachments((current) => ({ ...current, [message.id]: url })); else URL.revokeObjectURL(url);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [activeMessages, attachments, mediaReady]);
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
    if (!firebaseUser || sending || (view === "private" && !roomId) || (view === "groups" && !groupId)) return;
    setSending(true);
    try {
      if (view === "groups") await sendGroupChatMessage(groupId, firebaseUser.uid, draft, reply ?? undefined, attachment, self?.name);
      else await sendChatMessage(view === "public" ? null : roomId, firebaseUser.uid, draft, reply ?? undefined, view === "public", attachment, self?.name);
      setDraft(""); setReply(null);
      if (view === "private") void setChatTyping(roomId, firebaseUser.uid, false).catch(() => undefined);
    } catch (error: any) { toast.error(errorMessage(error, "Ujumbe haukutumwa.")); }
    finally { setSending(false); }
  };
  const onFile = async (file?: File) => {
    if (!file || !firebaseUser || (view !== "public" && !roomId)) return;
    setFileBusy(true);
    try { const attachment = await uploadChatFile(view === "public" ? null : (view === "groups" ? groupId : roomId), firebaseUser.uid, file, view === "public", view === "groups"); await send(attachment); }
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
  const openGroupSettings = () => { if (!currentGroup) return; setGroupSettingsName(currentGroup.name); setGroupSettingsDescription(currentGroup.description ?? ""); setGroupSettingsVisibility(currentGroup.visibility); setGroupSettingsOpen(true); };\n  const saveGroupSettings = async (event: React.FormEvent) => { event.preventDefault(); if (!firebaseUser || !currentGroup) return; try { await updateChatGroupSettings(currentGroup.id, firebaseUser.uid, { name: groupSettingsName, description: groupSettingsDescription, visibility: groupSettingsVisibility }); toast.success("Mipangilio ya group imehifadhiwa."); setGroupSettingsOpen(false); } catch (error: any) { toast.error(errorMessage(error, "Mipangilio haikuhifadhiwa.")); } };\n  const onGroupAvatar = async (file?: File) => { if (!file || !firebaseUser || !currentGroup) return; setGroupAvatarBusy(true); try { await uploadChatGroupAvatar(currentGroup.id, firebaseUser.uid, file); toast.success("Picha ya group imebadilishwa."); } catch (error: any) { toast.error(errorMessage(error, "Picha ya group haikupakiwa.")); } finally { setGroupAvatarBusy(false); if (groupAvatarRef.current) groupAvatarRef.current.value = ""; } };\n\n  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!self) return;
    const phones = groupPhones.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
    if (!groupName.trim() || !phones.length) { toast.error("Weka jina la group na angalau namba moja."); return; }
    try {
      const targets: ChatUser[] = [];
      for (const phone of phones) {
        const target = await findChatUser(phone);
        if (target.uid !== self.uid) targets.push(target);
      }
      const id = await createChatGroup(self, targets, groupName, groupDescription, groupVisibility);
      setGroupId(id); setView("groups"); setGroupModalOpen(false);
      setGroupName(""); setGroupPhones(""); setGroupDescription(""); setGroupVisibility("private");
      toast.success(groupVisibility === "public" ? "Public group limeundwa. Sasa inaweza kuonekana na watumiaji wengine." : "Private group limeundwa.");
    } catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kuunda group.")); }
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

  if (!isAuthenticated || !firebaseUser) return <main className={`portal-main chat-page${compactChat ? " chat-compact" : ""}`} data-chat-theme={chatTheme} data-chat-preview={showMessagePreview ? "show" : "hide"} data-chat-view={view} data-chat-selected={Boolean(roomId || groupId) ? "yes" : "no"}><div className="chat-login-card"><span className="chat-section-mark"><MessageCircle size={22}/></span><h1>Chat ya jumuiya</h1><p>Ingia ili uungane na jumuiya, utume ujumbe na kuzungumza binafsi.</p><Link className="button button--green" href="/">Rudi portal na uingie</Link></div></main>;

  const roomTitle = view === "public" ? "SmartServices group" : view === "all" ? "Chagua mazungumzo" : view === "groups" ? (currentGroup?.name ?? "Chagua group") : view === "moderation" ? (currentConversation ? currentConversation.participants.map((id) => currentConversation.names?.[id] ?? id).join("  ·  ") : "Chagua mazungumzo") : otherUser?.name ?? "Chagua mazungumzo";
  const roomSubtitle = view === "public" ? "Wanachama wote wa SmartServicesTZ wanaweza kushiriki" : view === "all" ? "Chagua group au soga binafsi kuanza kuzungumza" : view === "groups" ? `${currentGroup?.memberIds.length ?? 0} wanachama · group chat` : view === "moderation" ? "Mwonekano wa msimamizi · mazungumzo binafsi" : presence?.online ? "Yupo mtandaoni" : showLastSeen && presence?.lastSeen ? `Mara ya mwisho ${dateLabel(presence.lastSeen)}` : "Hali ya mtandaoni imefichwa";
  const roomError = view === "public" ? publicError : messageError;
  const loading = view === "public" ? loadingPublic : loadingMessages;

  return <main className="portal-main chat-page" data-chat-theme={chatTheme} data-chat-view={view} data-chat-selected={Boolean(roomId || groupId || view === "public") ? "yes" : "no"}>
    <header className="chat-page-head"><div><span className="overline">JUMUIYA YA $TEWARD TZ</span><h1>Ujumbe na mazungumzo</h1><p>Shiriki mawazo na zungumza moja kwa moja.</p></div><div className="chat-head-actions"><div className="chat-connection"><i/> Imeunganishwa</div><div className="chat-top-menu-wrap"><button type="button" className="chat-settings-trigger chat-plus-trigger" onClick={() => { setMoreMenuOpen(false); setMemberSearch(""); setContactsOpen(true); }} aria-label="Chagua mwanachama wa kuzungumza naye">＋ <span>Chat mpya</span></button><button type="button" className="chat-settings-trigger chat-more-trigger" onClick={() => setMoreMenuOpen(v => !v)} aria-label="Menyu zaidi">⋮</button>{moreMenuOpen && <div className="chat-more-menu"><button type="button" onClick={() => {setGroupModalOpen(true);setGroupVisibility("private");setMoreMenuOpen(false)}}>Kikundi kipya</button><button type="button" onClick={() => {setGroupModalOpen(true);setGroupVisibility("public");setMoreMenuOpen(false)}}>Jumuiya mpya</button><button type="button" onClick={() => {setUnread({});setChatFilter("all");setMoreMenuOpen(false);toast.success("Orodha imewekwa kama imesomwa kwenye kifaa hiki.")}}>Soma zote</button><button type="button" onClick={() => {setSettingsOpen(true);setMoreMenuOpen(false)}}>Mipangilio</button></div>}</div></div></header>
    {!mediaReady && <div role="status" className="chat-media-notice"><File size={17}/><span><strong>Ujumbe wa maandishi unapatikana.</strong> Picha, faili na voice message zitasubiri hadi Firebase Storage ianzishwe na rules zake zichapishwe.</span></div>}
    <section className="chat-workspace">
      <aside className="chat-sidebar">
        <div className="chat-sidebar-heading"><div><span className="chat-section-mark"><MessageCircle size={18}/></span><strong>Ujumbe</strong></div><span className="chat-total-count">{view === "moderation" ? moderationConversations.length : conversations.length}</span></div>
        <nav className="chat-tabs" aria-label="Aina ya mazungumzo">
          <button className={listCategory === "all" ? "active" : ""} onClick={() => { setListCategory("all"); setContactSearch(""); }}><MessageCircle size={16}/> Yote</button>
          <button className={listCategory === "public" ? "active" : ""} onClick={() => { setListCategory("public"); setContactSearch(""); }}><Users size={16}/> Jumuiya</button>
          <button className={listCategory === "private" ? "active" : ""} onClick={() => { setListCategory("private"); setContactSearch(""); }}><MessageCircle size={16}/> Binafsi</button><button className={listCategory === "groups" ? "active" : ""} onClick={() => { setListCategory("groups"); setContactSearch(""); }}><Users size={16}/> Magroup</button>
          {canModerate && <button className={listCategory === "moderation" ? "active" : ""} onClick={() => { setListCategory("moderation"); setContactSearch(""); }}><ShieldAlert size={16}/> Usimamizi</button>}
        </nav>
        {listCategory === "public" ? <div className="chat-public-card" role="button" tabIndex={0} onClick={() => setView("public")} onKeyDown={(event) => { if (event.key === "Enter") setView("public"); }}><div className="chat-avatar chat-avatar--large"><Users size={20}/></div><strong>SmartServices group</strong><span>Jumuiya ya mfumo mzima: wanachama wote wanaweza kuchati hapa.</span><div className="chat-public-pulse"><i/> Mazungumzo yanaendelea</div></div> : <>
          {listCategory === "private" && <form className="chat-start-form" onSubmit={startPrivateChat}><label htmlFor="chat-phone">Anzisha mazungumzo</label><div><input id="chat-phone" value={phoneLookup} onChange={(event) => setPhoneLookup(event.target.value)} placeholder="Namba ya simu" inputMode="tel"/><button aria-label="Tafuta mtumiaji" type="submit"><Send size={16}/></button></div></form>}
          {listCategory === "groups" && <div className="chat-group-tools"><button type="button" className="button button--green button--small" onClick={() => setGroupModalOpen(true)}><Users size={15}/> + Tengeneza group</button><small>Magroup uliyojiunga nayo yataonekana hapa na kwenye Yote.</small></div>}<label className="chat-contact-search"><Search size={16}/><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder={view === "moderation" ? "Tafuta mazungumzo" : "Tafuta mazungumzo"}/></label>{listCategory === "private" && <div className="chat-filter-pills" role="group" aria-label="Chuja mazungumzo"><button type="button" className={chatFilter === "all" ? "active" : ""} onClick={() => setChatFilter("all")}>Yote</button><button type="button" className={chatFilter === "unread" ? "active" : ""} onClick={() => setChatFilter("unread")}>Hayajasomwa {Object.values(unread).reduce((sum, count) => sum + count, 0) > 0 && <b>{Object.values(unread).reduce((sum, count) => sum + count, 0)}</b>}</button></div>}
          <div className="chat-contacts">
            {loadingConversations && <div className="chat-list-hint"><LoaderCircle className="chat-spin" size={17}/> Inapakia mazungumzo…</div>}
            {conversationError && <div className="chat-inline-error">{conversationError}<button onClick={() => window.location.reload()}>Jaribu tena</button></div>}
            {listCategory === "all" && <button type="button" className={`chat-contact ${view === "public" ? "active" : ""}`} onClick={() => { setView("public"); setRoomId(""); setGroupId(""); setMessageError(""); }}><span className="chat-avatar chat-avatar--group"><Users size={16}/></span><span className="chat-contact-copy"><strong>SmartServices group</strong><small>Jumuiya ya wanachama wote</small></span></button>}{(listCategory === "groups" || listCategory === "all") && !loadingConversations && !conversationError && [...groups, ...publicGroups.filter((group) => !groups.some((mine) => mine.id === group.id))].filter((group) => !contactSearch.trim() || group.name.toLowerCase().includes(contactSearch.trim().toLowerCase())).map((group) => { const joined = group.memberIds.includes(firebaseUser.uid); return <button key={group.id} className={`chat-contact ${groupId === group.id ? "active" : ""}`} onClick={() => { if (joined) { setGroupId(group.id); setRoomId(""); setView("groups"); setMessageError(""); } }}><span className="chat-avatar chat-avatar--group">{group.avatarUrl ? <img src={group.avatarUrl} alt=""/> : <Users size={16}/>}</span><span className="chat-contact-copy"><strong>{group.name}</strong><small>{group.visibility === "public" ? "🌐 Public · " : "🔒 Private · "}{group.lastMessage || group.memberIds.length + " wanachama"}</small></span>{group.visibility === "public" && !joined && <b className="chat-join-pill" onClick={(e) => { e.stopPropagation(); void requestToJoinChatGroup(group.id, self!).then(() => toast.success("Ombi la kujiunga limetumwa.")).catch((error) => toast.error(errorMessage(error, "Ombi halikutumwa."))); }}>OMBA</b>}</button>; })}
            {listCategory !== "groups" && listCategory !== "public" && !loadingConversations && !conversationError && displayedConversations.map((conversation) => {
              const other = conversation.participants.find((uid) => uid !== firebaseUser.uid) ?? "";
              const name = view === "moderation" ? conversation.participants.map((id) => conversation.names?.[id] ?? id).join(" · ") : conversation.names?.[other] ?? "Mwanachama";
              const subtitle = view === "moderation" ? conversation.lastMessage || "Mazungumzo binafsi" : conversation.lastMessage || "Mazungumzo yameanza";
              return <button key={conversation.id} className={`chat-contact ${roomId === conversation.id ? "active" : ""}`} onClick={() => { setRoomId(conversation.id); setGroupId(""); setView(view === "moderation" ? "moderation" : "private"); setMessageError(""); }}><span className="chat-avatar">{initials(name)}</span><span className="chat-contact-copy"><strong>{name}</strong><small>{subtitle}</small></span>{view === "private" && unread[conversation.id] > 0 && <b className="chat-unread">{unread[conversation.id]}</b>}</button>;
            })}
            {listCategory !== "groups" && listCategory !== "public" && !loadingConversations && !conversationError && filteredConversations.length === 0 && <p className="chat-empty">{view === "moderation" ? "Bado hakuna mazungumzo ya kusimamia." : "Tafuta namba ya simu ili kuanza mazungumzo."}</p>}
          </div>
        </>}
        {listCategory === "moderation" && <div className="chat-moderation-note"><ShieldAlert size={15}/> Ufikiaji wa moderation umewekewa role yenye ruhusa ya kusimamia ujumbe.</div>}
      </aside>
      <section className="chat-main">
        <header className="chat-room-head"><button type="button" className="chat-mobile-back" aria-label="Rudi kwenye orodha ya mazungumzo" onClick={() => { setRoomId(""); setGroupId(""); }}><ArrowLeft size={19}/></button><div className="chat-room-title"><span className="chat-avatar">{view === "groups" && currentGroup?.avatarUrl ? <img src={currentGroup.avatarUrl} alt="Picha ya group"/> : view === "public" || view === "groups" ? <Users size={18}/> : otherUser?.profileImageUrl ? <img src={otherUser.profileImageUrl} alt="" /> : initials(roomTitle)}</span><div><strong>{roomTitle}</strong><small>{roomSubtitle}</small>{view === "groups" && currentGroup && <span className="chat-group-link" onClick={() => { const link = `${window.location.origin}${import.meta.env.BASE_URL}chat?group=${currentGroup.id}`; void navigator.clipboard?.writeText(link).then(() => toast.success("Link ya group imenakiliwa.")); }}>{currentGroup.visibility === "public" ? "🌐 Public" : "🔒 Private"} · Nakili link</span>}</div></div><div className="chat-room-tools">{view === "private" && <><button type="button" className="chat-call-action" title="Simu ya sauti" aria-label="Simu ya sauti" onClick={() => toast.info("Simu za sauti zitawezeshwa baada ya kuunganishwa na huduma ya real-time calling.")}><Mic size={16}/></button><button type="button" className="chat-call-action" title="Video call" aria-label="Video call" onClick={() => toast.info("Video call bado haijaunganishwa na huduma ya real-time calling.")}><Video size={16}/></button></>}<button type="button" title="Tafuta ujumbe" aria-label="Tafuta ujumbe" className={messageSearchOpen ? "active" : ""} onClick={() => { setMessageSearchOpen((value) => !value); if (messageSearchOpen) setMessageSearch(""); }}><Search size={17}/></button><button type="button" title="Nenda mwisho wa mazungumzo" aria-label="Nenda mwisho wa mazungumzo" onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}><ChevronDown size={18}/></button>{view === "private" && otherUid && <div className="chat-safety-actions"><button title="Ripoti" onClick={() => void report()}><ShieldAlert size={17}/></button><button title="Zuia" onClick={() => void block()}><Ban size={17}/></button></div>}{view === "moderation" && <span className="chat-admin-badge">MODERATION</span>}{view === "groups" && currentGroup && <button type="button" className="chat-call-action" title="Mipangilio ya group na wanachama" aria-label="Mipangilio ya group" onClick={openGroupSettings}><Settings size={17}/></button>}{view === "groups" && currentGroup?.ownerId === firebaseUser.uid && groupJoinRequests.length > 0 && <div className="chat-join-requests"><strong>Maombi {groupJoinRequests.length}</strong>{groupJoinRequests.map((request) => <button key={request.id} onClick={() => void approveChatGroupJoinRequest(currentGroup.id, request).then(() => toast.success(`${request.userName} ameongezwa kwenye group.`)).catch((error) => toast.error(errorMessage(error, "Ombi halikukubaliwa.")))}>{request.userName} · Kubali</button>)}</div>}</div></header>
        {messageSearchOpen && <div className="chat-message-search"><Search size={15}/><input autoFocus value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Tafuta ndani ya ujumbe..." /><button type="button" onClick={() => setMessageSearch("")}>×</button></div>}<div className="chat-message-list" ref={scrollRef}>
          {((view === "private" || view === "moderation") && !roomId) || (view === "groups" && !groupId) ? <div className="chat-empty-state"><span className="chat-section-mark"><MessageCircle size={22}/></span><strong>{view === "moderation" ? "Chagua mazungumzo" : view === "groups" ? "Chagua group" : "Anza mazungumzo binafsi"}</strong><span>{view === "moderation" ? "Chagua mazungumzo ili kuona na kusimamia ujumbe." : view === "groups" ? "Chagua group au tengeneza group jipya." : "Tafuta kwa namba ya simu au chagua mazungumzo yaliyopo."}</span></div> : loading ? <div className="chat-empty-state"><LoaderCircle className="chat-spin" size={25}/><span>Inapakia ujumbe…</span></div> : roomError ? <div className="chat-empty-state chat-empty-state--error"><ShieldAlert size={28}/><strong>Chat haikupakia</strong><span>{roomError}</span></div> : activeMessages.length === 0 ? <div className="chat-empty-state"><span className="chat-section-mark"><MessageCircle size={22}/></span><strong>Hakuna ujumbe bado</strong><span>Anza mazungumzo kwa kutuma ujumbe wa kwanza.</span></div> : filteredMessages.map((message) => {
            const own = message.senderId === firebaseUser.uid;
            const senderName = own ? "Wewe" : (view === "moderation" ? currentConversation?.names?.[message.senderId] : view === "private" ? currentConversation?.names?.[message.senderId] : view === "groups" ? currentGroup?.memberNames?.[message.senderId] : message.senderName) ?? "Mwanachama";
            const isImage = message.fileType?.startsWith("image/");
            const isAudio = message.fileType?.startsWith("audio/");
            const canEdit = own && Boolean(message.text) && view !== "moderation" && view !== "groups";
            const canDelete = view !== "groups" && (own || (view === "moderation" && canModerate) || (view === "public" && canModerate));
            return <article key={message.id} className={`chat-message-row ${own ? "own" : ""}`}>
              <span className="chat-avatar chat-message-avatar">{(() => { const imageUrl = view === "groups" ? currentGroup?.memberImages?.[message.senderId] : view === "private" || view === "moderation" ? currentConversation?.profileImages?.[message.senderId] : ""; return imageUrl ? <img src={imageUrl} alt="" /> : initials(senderName); })()}</span>
              <div className="chat-bubble-wrap"><small className="chat-sender">{senderName}</small><div className={`chat-bubble ${own ? "own" : ""}`}>
                {message.replyTo && <div className="chat-reply-preview">↪ {message.replyTo.text}</div>}
                {editingId === message.id ? <div className="chat-edit-box"><textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={5000}/><div><button onClick={() => { setEditingId(""); setEditDraft(""); }}>Ghairi</button><button className="primary" onClick={() => void saveEdit(message)}>Hifadhi</button></div></div> : message.text && <p>{message.text}</p>}
                {message.filePath && attachments[message.id] && (isImage ? <a href={attachments[message.id]} target="_blank" rel="noreferrer"><img className="chat-image" src={attachments[message.id]} alt={message.fileName ?? "Picha iliyotumwa"}/></a> : isAudio ? <audio controls src={attachments[message.id]}/> : <a className="chat-file" href={attachments[message.id]} download={message.fileName}><File size={16}/>{message.fileName ?? "Faili"}</a>)}
                {message.filePath && !mediaReady && <span className="chat-file-pending"><File size={15}/> Kiambatisho kitasomwa Storage ikianzishwa.</span>}
                {message.filePath && mediaReady && !attachments[message.id] && <span className="chat-file-pending"><File size={15}/> Inapakia kiambatisho…</span>}
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
        <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <input ref={fileRef} type="file" hidden accept="image/*,application/pdf,text/plain,audio/*" disabled={!mediaReady} onChange={(event) => void onFile(event.target.files?.[0])}/>
          <button type="button" title={mediaReady ? "Ambatisha picha/faili" : "Firebase Storage haijawezeshwa"} onClick={() => fileRef.current?.click()} disabled={!mediaReady || fileBusy || (view === "private" && !roomId) || (view === "groups" && !groupId)}><Paperclip size={18}/></button>
          <button type="button" title="Fungua emoji" aria-label="Fungua emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen((value) => !value)} disabled={(view === "private" && !roomId) || (view === "groups" && !groupId)}><Smile size={18}/></button>
          <input value={draft} onChange={(event) => setTypingDraft(event.target.value)} placeholder={view === "public" ? "Andika ujumbe wa jumuiya…" : view === "moderation" ? "Moderation ni ya kusoma na kusimamia ujumbe tu" : view === "groups" ? (groupId ? "Andika ujumbe wa group…" : "Chagua group kwanza") : roomId ? "Andika ujumbe…" : "Chagua mazungumzo kwanza"} disabled={(view === "private" && !roomId) || (view === "groups" && !groupId) || view === "moderation"}/>
          <div className="chat-composer-actions">
            {view !== "moderation" && <button type="button" title={!mediaReady ? "Firebase Storage haijawezeshwa" : recording ? "Simamisha kurekodi" : "Rekodi voice message"} onClick={() => recording ? mediaRecorder.current?.stop() : void startVoiceNote()} disabled={!mediaReady || (view === "private" && !roomId) || (view === "groups" && !groupId)}>{recording ? <StopCircle size={18}/> : <Mic size={18}/>}</button>}
            <button className="chat-send-button" type="submit" title="Tuma ujumbe" disabled={fileBusy || sending || view === "moderation" || (view === "private" && !roomId) || (view === "groups" && !groupId) || (!draft.trim() && !recording)}>{sending ? <LoaderCircle className="chat-spin" size={18}/> : <Send size={18}/>}</button>
          </div>
        </form>
        {emojiOpen && <div className="chat-emoji-row" role="group" aria-label="Chagua emoji">{emojis.map((emoji) => <button type="button" key={emoji} aria-label={`Tuma ${emoji}`} onClick={() => { setDraft((value) => value + emoji); setEmojiOpen(false); }} disabled={view === "moderation"}>{emoji}</button>)}{fileBusy && <small>Inatuma faili…</small>}</div>}
      </section>
    </section>
    {contactsOpen && <div className="portal-modal-backdrop chat-contacts-backdrop" onClick={() => setContactsOpen(false)}><section className="portal-modal chat-members-modal" role="dialog" aria-modal="true" aria-labelledby="chat-members-title" onClick={(event) => event.stopPropagation()}><header><div><span className="overline">SMARTSERVICESTZ</span><h3 id="chat-members-title">Chagua mwanachama</h3><p>Wanachama wa mfumo wako kama mawasiliano yaliyohifadhiwa.</p></div><button type="button" className="modal-close" onClick={() => setContactsOpen(false)} aria-label="Funga"><X size={19}/></button></header><label className="chat-contact-search"><Search size={16}/><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Tafuta jina au namba ya simu"/></label><div className="chat-member-directory">{members.filter((member) => `${member.name} ${member.phone}`.toLowerCase().includes(memberSearch.toLowerCase())).map((member) => <button type="button" className="chat-contact" key={member.uid} onClick={async () => { if (!self) return; try { const id = await openPrivateConversation(self, member); setRoomId(id); setGroupId(""); setView("private"); setContactsOpen(false); setMessageError(""); } catch (error:any) { toast.error(errorMessage(error,"Imeshindikana kufungua chat.")); } }}><span className="chat-avatar">{member.profileImageUrl ? <img src={member.profileImageUrl} alt=""/> : initials(member.name)}</span><span className="chat-contact-copy"><strong>{member.name}</strong><small>{member.phone || "Mwanachama wa SmartServicesTZ"}</small></span><MessageCircle size={17}/></button>)}{members.length===0 && <p className="chat-empty">Orodha ya wanachama haijapatikana. Huenda Firestore Rules haziruhusu kusoma orodha ya watumiaji.</p>}</div><div className="chat-members-footer"><button type="button" className="button button--green" onClick={() => {setContactsOpen(false);setGroupModalOpen(true);setGroupVisibility("private")}}><Users size={16}/> Tengeneza group</button></div></section></div>}
    {settingsOpen && <ChatSettings onClose={() => setSettingsOpen(false)} profileName={self?.name || "$teward Tz"} username={profile?.username ? "@" + profile.username : "@Steward.tz"} />}{false && <div className="portal-modal-backdrop chat-settings-backdrop" onClick={() => setSettingsOpen(false)}><motion.section initial={{opacity:0,y:14,scale:.98}} animate={{opacity:1,y:0,scale:1}} transition={{duration:.18}} className="portal-modal chat-settings-modal" role="dialog" aria-modal="true" aria-labelledby="chat-settings-title" onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Funga mipangilio"><X size={19}/></button><span className="overline">SMARTSERVICESTZ CHAT</span><h3 id="chat-settings-title">Mipangilio ya mazungumzo</h3><p>Badilisha muonekano, arifa na faragha. Chaguo hizi zinahifadhiwa kwenye kifaa hiki.</p>
      <div className="chat-settings-section"><strong>Muonekano</strong><div className="chat-theme-options"><button type="button" className={chatTheme === "green" ? "selected" : ""} onClick={() => setChatTheme("green")}><i className="theme-dot theme-dot--green"/> WhatsApp Green</button><button type="button" className={chatTheme === "light" ? "selected" : ""} onClick={() => setChatTheme("light")}><i className="theme-dot theme-dot--light"/> Mwanga</button><button type="button" className={chatTheme === "dark" ? "selected" : ""} onClick={() => setChatTheme("dark")}><i className="theme-dot theme-dot--dark"/> Giza</button></div></div>
      <div className="chat-settings-section"><strong><Volume2 size={15}/> Arifa na sauti</strong><label className="chat-setting-row"><span><strong>Sauti ya ujumbe mpya</strong><small>Mlio mfupi ujumbe mpya unapowasili.</small></span><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)}/></label><label className="chat-setting-row"><span><strong>Arifa za desktop</strong><small>Arifa wakati chat haiko kwenye tab iliyo wazi.</small></span><input type="checkbox" checked={desktopAlerts} onChange={async (event) => { if (event.target.checked && "Notification" in window) { const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission; if (permission !== "granted") { toast.error("Ruhusa ya arifa haijatolewa kwenye kivinjari."); return; } } else if (event.target.checked && !("Notification" in window)) { toast.error("Kivinjari hiki hakitumii arifa za desktop."); return; } setDesktopAlerts(event.target.checked); }}/></label></div>
      <div className="chat-settings-section"><strong><Eye size={15}/> Faragha</strong><label className="chat-setting-row"><span><strong>Onyesha mara ya mwisho</strong><small>Ficha au onyesha last seen ya mtu mwingine.</small></span><input type="checkbox" checked={showLastSeen} onChange={(event) => setShowLastSeen(event.target.checked)}/></label><label className="chat-setting-row"><span><strong>Read receipts</strong><small>Washa au zima kuashiria ujumbe kuwa umesomwa.</small></span><input type="checkbox" checked={readReceipts} onChange={(event) => setReadReceipts(event.target.checked)}/></label></div>
      <div className="chat-settings-section"><strong><HardDrive size={15}/> Hifadhi na matumizi ya data</strong><div className="chat-storage-stats"><span>Ujumbe kwenye chat inayoonekana<b>{activeMessages.length}</b></span><span>Viambatisho vilivyohifadhiwa kwenye cache<b>{Object.keys(attachments).length}</b></span></div><button type="button" className="chat-cache-clear" onClick={() => { Object.values(attachments).forEach((url) => URL.revokeObjectURL(url)); setAttachments({}); toast.success("Cache ya viambatisho imeondolewa kwenye kifaa hiki."); }}><Trash2 size={15}/> Safisha cache ya viambatisho</button></div>
      <div className="chat-settings-section"><strong>Zuia mtumiaji na kufuta mazungumzo</strong><p className="chat-settings-help">Kwa chat binafsi, tumia vitufe vya kuzuia au kuripoti kwenye kichwa cha mazungumzo. Kufuta mazungumzo yote hakujawashwa hapa kwa sababu backend ya sasa haina kitendo salama cha kufuta mazungumzo yote kwa pande zote.</p></div>
      <label className="chat-setting-row"><span><strong>Muonekano mfupi</strong><small>Punguza nafasi kati ya mazungumzo na ujumbe.</small></span><input type="checkbox" checked={compactChat} onChange={(event) => setCompactChat(event.target.checked)}/></label><label className="chat-setting-row"><span><strong>Onyesha ujumbe wa mwisho</strong><small>Onyesha au ficha preview kwenye orodha.</small></span><input type="checkbox" checked={showMessagePreview} onChange={(event) => setShowMessagePreview(event.target.checked)}/></label><button type="button" className="button button--green button--wide" onClick={() => setSettingsOpen(false)}>Hifadhi na funga</button></motion.section></div>}
    {groupSettingsOpen && currentGroup && <div className="portal-modal-backdrop chat-group-settings-backdrop" onClick={() => setGroupSettingsOpen(false)}><section className="portal-modal chat-group-settings-modal" role="dialog" aria-modal="true" aria-labelledby="chat-group-settings-title" onClick={(event) => event.stopPropagation()}><header className="chat-group-settings-head"><div className="chat-group-avatar-large">{currentGroup.avatarUrl ? <img src={currentGroup.avatarUrl} alt="Picha ya group"/> : <Users size={25}/>}</div><div><span className="overline">GROUP SETTINGS</span><h3 id="chat-group-settings-title">{currentGroup.name}</h3><p>{currentGroup.memberIds.length} wanachama · {currentGroup.visibility === "public" ? "Public" : "Private"}</p></div><button type="button" className="modal-close" onClick={() => setGroupSettingsOpen(false)} aria-label="Funga"><X size={19}/></button></header><div className="chat-group-settings-body">{currentGroup.ownerId === firebaseUser.uid && <><input ref={groupAvatarRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => void onGroupAvatar(event.target.files?.[0])}/><button type="button" className="chat-group-avatar-action" onClick={() => groupAvatarRef.current?.click()} disabled={groupAvatarBusy}><Camera size={16}/>{groupAvatarBusy ? "Inapakia picha…" : "Badilisha picha / Avatar ya group"}</button><form className="chat-group-settings-form" onSubmit={(event) => void saveGroupSettings(event)}><label className="control-field"><span>Jina la group</span><input value={groupSettingsName} onChange={(event) => setGroupSettingsName(event.target.value)} maxLength={80} required/></label><label className="control-field"><span>Maelezo</span><textarea value={groupSettingsDescription} onChange={(event) => setGroupSettingsDescription(event.target.value)} maxLength={240} rows={2} placeholder="Group hili linahusu nini?"/></label><label className="control-field"><span>Faragha ya group</span><select value={groupSettingsVisibility} onChange={(event) => setGroupSettingsVisibility(event.target.value as "private" | "public")}><option value="private">Private — walioalikwa pekee</option><option value="public">Public — watu wanaweza kuomba kujiunga</option></select></label><button type="submit" className="button button--green button--wide">Hifadhi mipangilio</button></form></>}{currentGroup.ownerId !== firebaseUser.uid && <div className="chat-group-description">{currentGroup.description || "Hakuna maelezo ya group yaliyowekwa."}</div>}<div className="chat-group-members-heading"><strong><UserRound size={17}/> Wanachama wote</strong><span>{currentGroup.memberIds.length}</span></div><div className="chat-group-member-list">{currentGroup.memberIds.map((uid) => { const isOwner = uid === currentGroup.ownerId; const name = currentGroup.memberNames?.[uid] || "Mwanachama"; const phone = currentGroup.memberPhones?.[uid] || ""; const avatar = currentGroup.memberImages?.[uid]; return <div className="chat-group-member-row" key={uid}><span className="chat-avatar">{avatar ? <img src={avatar} alt=""/> : initials(name)}</span><span className="chat-group-member-copy"><strong>{name}{uid === firebaseUser.uid ? " (Wewe)" : ""}</strong><small>{phone || "Namba haijawekwa"}</small></span><span className={isOwner ? "chat-group-role admin" : "chat-group-role"}>{isOwner ? "Admin / Msimamizi" : "Mwanachama"}</span></div>; })}</div><p className="chat-group-settings-note">Admin wa group ndiye anayeweza kubadilisha picha na mipangilio. Orodha hii inaonyesha wanachama wote waliopo kwenye group.</p></div></section></div>}
    {groupModalOpen && <div className="portal-modal-backdrop" onClick={() => setGroupModalOpen(false)}><form className="portal-modal chat-group-modal" onSubmit={createGroup} onClick={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setGroupModalOpen(false)}><X size={19}/></button><span className="overline">NEW GROUP</span><h3>Tengeneza group</h3><p>Weka jina la group na namba za simu za watu unaotaka kuwaongeza.</p><label className="control-field"><span>Jina la group</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Mfano: Wafanyabiashara Kiteto" /></label><label className="control-field"><span>Namba za simu</span><textarea value={groupPhones} onChange={(event) => setGroupPhones(event.target.value)} placeholder="0698..., 0754... au kila namba mstari mpya" rows={4}/></label><label className="control-field"><span>Maelezo (hiari)</span><textarea value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Group hili linahusu nini?" rows={3}/></label><label className="control-field"><span>Aina ya group</span><select value={groupVisibility} onChange={(event) => setGroupVisibility(event.target.value as "private" | "public")}><option value="private">Private — walioalikwa pekee</option><option value="public">Public — ombi la kujiunga</option></select></label><button type="submit" className="button button--green button--wide"><Users size={16}/> Unda group</button></form></div>}<p className="chat-call-notice">Voice/video calls bado hazijatekelezwa, kwa hiyo hakuna vitufe vya simu visivyofanya kazi.</p>
  </main>;
}
