import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Ban, Camera, Check, CheckCheck, ChevronDown, File, LoaderCircle, Lock, MessageCircle, MessageSquarePlus, Mic, MoreVertical, Paperclip, Pencil, Phone, Reply, Search, Send, Settings, ShieldAlert, Smile, Square, Trash2, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { addChatGroupMember, approveChatGroupJoinRequest, blockChatUser, createChatGroup, deleteChatMessage, editChatMessage, findChatUser, leaveChatGroup, loadChatAttachment, markChatMessageRead, openPrivateConversation, reportChatGroup, reportChatUser, requestToJoinChatGroup, sendChatMessage, sendGroupChatMessage, setChatGroupTyping, setChatTyping, subscribeAllConversations, subscribeChatGroups, subscribeChatMembers, subscribeConversations, subscribeGroupChat, subscribeGroupJoinRequests, subscribeGroupTyping, subscribePresence, subscribePrivateChat, subscribePublicChat, subscribePublicChatGroups, subscribeTyping, updateChatGroupSettings, updatePresence, uploadChatFile, uploadChatGroupAvatar, type ChatGroup, type ChatGroupJoinRequest, type ChatMessage, type ChatUser, type PrivateConversation } from "@/lib/firebase";
import "./chat.css";
import ChatSettings from "./ChatSettings";

/* ───────────── helpers ───────────── */

type View = "all" | "public" | "private" | "groups" | "moderation";
type Category = "all" | "unread" | "public" | "private" | "groups" | "moderation";

const EMOJIS = ["😀", "😂", "🥰", "😍", "😎", "🤝", "👍", "👏", "🙏", "❤️", "💚", "🎉", "🔥", "✅", "💪", "😢", "😡", "🤔", "🥳", "⭐", "📌", "💡", "🚀", "🙌"];

const toDate = (value: unknown): Date | null => (value && typeof (value as any).toDate === "function" ? (value as any).toDate() : null);
const timeLabel = (value: unknown) => toDate(value)?.toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" }) ?? "";
function dayLabel(date: Date) {
  const today = new Date();
  const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (diff === 0) return "Leo";
  if (diff === 1) return "Jana";
  return date.toLocaleDateString("sw-TZ", { day: "numeric", month: "long", year: "numeric" });
}
function listTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "";
  const label = dayLabel(date);
  return label === "Leo" ? timeLabel(value) : label === "Jana" ? "Jana" : date.toLocaleDateString("sw-TZ", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function errorMessage(error: any, fallback: string) {
  if (error?.code === "permission-denied") return "Ruhusa ya Chat imekataliwa na Firebase. Hakikisha sheria za Firestore na Storage zimechapishwa.";
  if (error?.code === "unauthenticated") return "Kipindi chako kimeisha. Ingia tena kisha ujaribu.";
  return error?.message || fallback;
}
const initials = (name?: string) => (name?.trim() || "M").slice(0, 1).toUpperCase();
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function readStored(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function useStoredBool(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readStored(key, String(fallback)) === "true");
  useEffect(() => { try { localStorage.setItem(key, String(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}
function playPing() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = 740; gain.gain.value = 0.035; osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.09); osc.onended = () => void ctx.close();
  } catch {}
}

/* ───────────── small presentational pieces ───────────── */

function Avatar({ src, name, icon, size = "md", online }: { src?: string; name?: string; icon?: "group"; size?: "sm" | "md" | "lg"; online?: boolean }) {
  return <span className={`wa-avatar wa-avatar--${size}${icon ? " wa-avatar--group" : ""}`}>
    {src ? <img src={src} alt="" /> : icon ? <Users size={size === "lg" ? 26 : 18} /> : initials(name)}
    {online && <i className="wa-online-dot" />}
  </span>;
}

function Ticks({ message, uid }: { message: ChatMessage; uid: string }) {
  const read = message.readBy?.some((id) => id !== uid);
  const delivered = message.deliveredTo?.some((id) => id !== uid);
  return <span className={`wa-ticks${read ? " is-read" : ""}`} title={read ? "Imesomwa" : delivered ? "Imefika" : "Imetumwa"}>{read || delivered ? <CheckCheck size={15} /> : <Check size={15} />}</span>;
}

function ChatRow({ active, avatar, title, subtitle, time, unread, badge, onClick }: { active: boolean; avatar: React.ReactNode; title: string; subtitle?: React.ReactNode; time?: string; unread?: number; badge?: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`wa-row${active ? " active" : ""}${unread ? " has-unread" : ""}`} onClick={onClick}>
    {avatar}
    <span className="wa-row-body">
      <span className="wa-row-top"><strong>{title}</strong>{time && <time>{time}</time>}</span>
      <span className="wa-row-bottom"><small>{subtitle}</small>{badge}{unread ? <b className="wa-badge">{unread > 99 ? "99+" : unread}</b> : null}</span>
    </span>
  </button>;
}

type TimelineItem = { kind: "day"; key: string; label: string } | { kind: "msg"; message: ChatMessage; first: boolean; last: boolean };

/* ───────────── page ───────────── */

export default function ChatPage() {
  const { firebaseUser, profile, user, isAuthenticated } = useAuth();
  const mediaReady = import.meta.env.VITE_FIREBASE_STORAGE_READY === "true";
  const canModerate = Boolean(user?.role === "super_admin" || user?.permissions?.manageMessages);
  const uid = firebaseUser?.uid ?? "";

  // preferences (written by ChatSettings, read here)
  const chatTheme = readStored("sstz-chat-theme", "green");
  const compactChat = readStored("sstz-chat-compact", "false") === "true";
  const showPreview = readStored("sstz-chat-preview", "true") !== "false";
  const [soundEnabled] = useStoredBool("sstz-chat-sound", true);
  const [desktopAlerts] = useStoredBool("sstz-chat-desktop-alerts", false);
  const [showLastSeen] = useStoredBool("sstz-chat-last-seen", true);
  const [readReceipts] = useStoredBool("sstz-chat-read-receipts", true);
  const [groupNotifications, setGroupNotifications] = useStoredBool("sstz-group-notifications", true);
  const [groupAutoDownload, setGroupAutoDownload] = useStoredBool("sstz-group-auto-download", false);
  const [groupDisappearing, setGroupDisappearing] = useStoredBool("sstz-group-disappearing", false);
  const [groupLockEnabled, setGroupLockEnabled] = useStoredBool("sstz-group-lock-preference", false);

  // navigation
  const [view, setView] = useState<View>("all");
  const [category, setCategory] = useState<Category>("all");
  const [roomId, setRoomId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [listSearch, setListSearch] = useState("");

  // data
  const [members, setMembers] = useState<ChatUser[]>([]);
  const [publicMessages, setPublicMessages] = useState<ChatMessage[]>([]);
  const [privateMessages, setPrivateMessages] = useState<ChatMessage[]>([]);
  const [groupMessages, setGroupMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [moderationConversations, setModerationConversations] = useState<PrivateConversation[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [publicGroups, setPublicGroups] = useState<ChatGroup[]>([]);
  const [joinRequests, setJoinRequests] = useState<ChatGroupJoinRequest[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [presence, setPresence] = useState<{ online: boolean; lastSeen?: unknown } | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [attachments, setAttachments] = useState<Record<string, string>>({});

  // ui
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [publicError, setPublicError] = useState("");
  const [conversationError, setConversationError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [phoneLookup, setPhoneLookup] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);

  // composer
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState("");

  // group modals
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPhones, setGroupPhones] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupVisibility, setGroupVisibility] = useState<"private" | "public">("private");
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [groupInfoTab, setGroupInfoTab] = useState<"members" | "media" | "settings">("members");
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [groupSettingsName, setGroupSettingsName] = useState("");
  const [groupSettingsDescription, setGroupSettingsDescription] = useState("");
  const [groupSettingsVisibility, setGroupSettingsVisibility] = useState<"private" | "public">("private");
  const [groupAvatarBusy, setGroupAvatarBusy] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addingMemberUid, setAddingMemberUid] = useState("");

  // refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const groupAvatarRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const previousMessageCount = useRef(0);

  /* ── derived ── */
  const self: ChatUser | null = firebaseUser ? { uid: firebaseUser.uid, name: profile?.name ?? firebaseUser.displayName ?? "Mwanachama", phone: profile?.phone ?? "", profileImageUrl: profile?.profileImageUrl, verificationStatus: profile?.verificationStatus } : null;
  const currentConversation = (view === "moderation" ? moderationConversations : conversations).find((item) => item.id === roomId);
  const currentGroup = groups.find((item) => item.id === groupId);
  const otherUid = view === "private" ? currentConversation?.participants.find((id) => id !== uid) ?? "" : "";
  const otherName = currentConversation?.names?.[otherUid] ?? "Mwanachama";
  const otherImage = currentConversation?.profileImages?.[otherUid];
  const activeMessages = view === "public" ? publicMessages : view === "groups" ? groupMessages : privateMessages;
  const chatSelected = view === "public" || Boolean(roomId || groupId);
  const totalUnread = Object.values(unread).reduce((sum, count) => sum + count, 0);
  const needsRoom = (view === "private" && !roomId) || (view === "groups" && !groupId);

  const nameOf = useCallback((message: ChatMessage) => {
    if (message.senderId === uid) return "Wewe";
    const resolved = view === "groups" ? currentGroup?.memberNames?.[message.senderId] : view === "private" || view === "moderation" ? currentConversation?.names?.[message.senderId] : undefined;
    return resolved ?? message.senderName ?? "Mwanachama";
  }, [uid, view, currentGroup, currentConversation]);
  const imageOf = (message: ChatMessage) => view === "groups" ? currentGroup?.memberImages?.[message.senderId] : view === "private" || view === "moderation" ? currentConversation?.profileImages?.[message.senderId] : undefined;

  const filteredMessages = useMemo(() => {
    const needle = messageSearch.trim().toLocaleLowerCase();
    if (!needle) return activeMessages;
    return activeMessages.filter((m) => `${m.text ?? ""} ${m.fileName ?? ""} ${m.senderName ?? ""}`.toLocaleLowerCase().includes(needle));
  }, [activeMessages, messageSearch]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = []; let lastDay = "";
    filteredMessages.forEach((message, i) => {
      const date = toDate(message.createdAt); const key = date?.toDateString() ?? "";
      let dayAdded = false;
      if (key && key !== lastDay) { out.push({ kind: "day", key: `${key}-${message.id}`, label: dayLabel(date!) }); lastDay = key; dayAdded = true; }
      const prev = filteredMessages[i - 1], next = filteredMessages[i + 1];
      out.push({ kind: "msg", message, first: dayAdded || !prev || prev.senderId !== message.senderId, last: !next || next.senderId !== message.senderId });
    });
    return out;
  }, [filteredMessages]);

  const needle = listSearch.trim().toLocaleLowerCase();
  const visibleConversations = (category === "moderation" ? moderationConversations : conversations).filter((c) => {
    if (category === "unread" && !(unread[c.id] > 0)) return false;
    if (!needle) return true;
    const label = category === "moderation" ? c.participants.map((id) => c.names?.[id] ?? id).join(" ") : c.names?.[c.participants.find((id) => id !== uid) ?? ""] ?? "";
    return `${label} ${c.lastMessage ?? ""}`.toLocaleLowerCase().includes(needle);
  });
  const allGroups = [...groups, ...publicGroups.filter((g) => !groups.some((mine) => mine.id === g.id))].filter((g) => !needle || g.name.toLocaleLowerCase().includes(needle));
  const showPublicRow = (category === "all" || category === "public") && (!needle || "smartservices group jumuiya".includes(needle));
  const showGroups = category === "all" || category === "groups";
  const showPrivate = category === "all" || category === "private" || category === "unread" || category === "moderation";

  /* ── navigation helpers ── */
  const resetTransient = () => { setMessageError(""); setReply(null); setEditingId(""); setMessageSearch(""); setMessageSearchOpen(false); setEmojiOpen(false); };
  const openPublic = () => { setView("public"); setRoomId(""); setGroupId(""); resetTransient(); };
  const openPrivate = (id: string) => { setRoomId(id); setGroupId(""); setView("private"); resetTransient(); };
  const openModeration = (id: string) => { setRoomId(id); setGroupId(""); setView("moderation"); resetTransient(); };
  const openGroup = (id: string) => { setGroupId(id); setRoomId(""); setView("groups"); resetTransient(); };
  const closeChat = () => { setRoomId(""); setGroupId(""); setView("all"); resetTransient(); setGroupSettingsOpen(false); };

  /* ── effects ── */
  useEffect(() => {
    if (previousMessageCount.current && activeMessages.length > previousMessageCount.current) {
      const latest = activeMessages[activeMessages.length - 1];
      if (latest && latest.senderId !== uid && (view !== "groups" || groupNotifications)) {
        if (soundEnabled) playPing();
        if (desktopAlerts && document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") new Notification(latest.senderName || "Ujumbe mpya", { body: latest.text || "Ametuma kiambatisho kipya." });
      }
    }
    previousMessageCount.current = activeMessages.length;
  }, [activeMessages, soundEnabled, desktopAlerts, groupNotifications, uid, view]);

  useEffect(() => {
    if (!firebaseUser) return;
    const update = () => { void updatePresence(firebaseUser.uid, document.visibilityState === "visible").catch(() => undefined); };
    update();
    document.addEventListener("visibilitychange", update); window.addEventListener("pagehide", update);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("pagehide", update); void updatePresence(firebaseUser.uid, false).catch(() => undefined); };
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingPublic(true); setPublicError("");
    return subscribePublicChat((rows) => { setPublicMessages(rows); setLoadingPublic(false); }, (e) => { setPublicError(errorMessage(e, "Imeshindikana kupakia public chat.")); setLoadingPublic(false); });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) return;
    setLoadingConversations(true); setConversationError("");
    return subscribeConversations(firebaseUser.uid, (rows) => { setConversations(rows); setLoadingConversations(false); }, (e) => { setConversationError(errorMessage(e, "Imeshindikana kupakia mazungumzo.")); setLoadingConversations(false); });
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) { setMembers([]); return; }
    return subscribeChatMembers((rows) => setMembers(rows.filter((m) => m.uid !== firebaseUser.uid)), () => setMembers([]));
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser) { setGroups([]); return; }
    return subscribeChatGroups(firebaseUser.uid, setGroups, (e) => setConversationError(errorMessage(e, "Imeshindikana kupakia magroup.")));
  }, [firebaseUser]);

  useEffect(() => { // public groups discoverable to join (signature: (onData, onError))
    if (!firebaseUser) { setPublicGroups([]); return; }
    return subscribePublicChatGroups(setPublicGroups, () => setPublicGroups([]));
  }, [firebaseUser]);

  useEffect(() => { // join requests, owner only (signature: (groupId, onData, onError))
    if (!firebaseUser || !currentGroup || currentGroup.ownerId !== firebaseUser.uid) { setJoinRequests([]); return; }
    return subscribeGroupJoinRequests(currentGroup.id, setJoinRequests, () => setJoinRequests([]));
  }, [firebaseUser, currentGroup?.id, currentGroup?.ownerId]);

  useEffect(() => {
    if (!firebaseUser || !canModerate || category !== "moderation") { setModerationConversations([]); return; }
    setLoadingConversations(true); setConversationError("");
    return subscribeAllConversations((rows) => { setModerationConversations(rows); setLoadingConversations(false); }, (e) => { setConversationError(errorMessage(e, "Imeshindikana kupakia mazungumzo ya moderation.")); setLoadingConversations(false); });
  }, [firebaseUser, canModerate, category]);

  useEffect(() => {
    if (!firebaseUser || (!roomId && !groupId) || view === "all" || view === "public") {
      setPrivateMessages([]); setGroupMessages([]); setTyping([]); setPresence(null); setLoadingMessages(false); return;
    }
    setLoadingMessages(true); setMessageError("");
    const stopMessages = view === "groups"
      ? subscribeGroupChat(groupId, (rows) => { setGroupMessages(rows); setLoadingMessages(false); }, (e) => { setMessageError(errorMessage(e, "Imeshindikana kupakia ujumbe wa group.")); setLoadingMessages(false); })
      : subscribePrivateChat(roomId, (rows) => { setPrivateMessages(rows); setLoadingMessages(false); }, (e) => { setMessageError(errorMessage(e, "Imeshindikana kupakia ujumbe binafsi.")); setLoadingMessages(false); });
    const stopTyping = view === "private" ? subscribeTyping(roomId, setTyping, () => undefined) : view === "groups" ? subscribeGroupTyping(groupId, setTyping, () => undefined) : () => {};
    const stopPresence = view === "private" && otherUid ? subscribePresence(otherUid, setPresence) : () => {};
    return () => { stopMessages(); stopTyping(); stopPresence(); };
  }, [firebaseUser, roomId, groupId, otherUid, view]);

  const conversationKey = conversations.map((c) => c.id).join("|");
  useEffect(() => { // unread counters for every private conversation
    if (!firebaseUser) return;
    const stops = conversations.map((c) => subscribePrivateChat(c.id, (rows) => {
      const count = rows.filter((m) => m.senderId !== firebaseUser.uid && !m.readBy?.includes(firebaseUser.uid)).length;
      setUnread((prev) => (prev[c.id] === count ? prev : { ...prev, [c.id]: count }));
    }, () => undefined));
    return () => stops.forEach((stop) => stop());
  }, [firebaseUser, conversationKey]);

  useEffect(() => {
    if (!firebaseUser || (view !== "public" && view !== "private") || !readReceipts) return;
    (view === "public" ? publicMessages : privateMessages)
      .filter((m) => m.senderId !== firebaseUser.uid && !m.readBy?.includes(firebaseUser.uid))
      .forEach((m) => void markChatMessageRead(view === "public" ? null : roomId, m, firebaseUser.uid, view === "public").catch(() => undefined));
  }, [firebaseUser, publicMessages, privateMessages, view, roomId, readReceipts]);

  useEffect(() => { // keep pinned to bottom only if the reader is already there (or just sent)
    const last = activeMessages[activeMessages.length - 1];
    if (nearBottom.current || last?.senderId === uid) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeMessages.length, view, uid]);
  useEffect(() => { nearBottom.current = true; scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [view, roomId, groupId]);

  useEffect(() => {
    let active = true;
    const pending = mediaReady ? [...activeMessages].filter((m) => m.filePath && !attachments[m.id]) : [];
    pending.forEach((message) => {
      void loadChatAttachment(message.filePath!).then((blob) => {
        const url = URL.createObjectURL(blob);
        if (active) setAttachments((cur) => ({ ...cur, [message.id]: url })); else URL.revokeObjectURL(url);
      }).catch(() => undefined);
    });
    return () => { active = false; };
  }, [activeMessages, attachments, mediaReady]);

  useEffect(() => {
    if (!recording) { setRecordSeconds(0); return; }
    const t = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(() => () => {
    Object.values(attachments).forEach((url) => URL.revokeObjectURL(url));
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  /* ── actions ── */
  const onScroll = () => {
    const el = scrollRef.current; if (!el) return;
    const away = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottom.current = away < 120; setShowJump(away > 320);
  };
  const jumpToEnd = () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  const startPrivateChat = async (event: React.FormEvent) => {
    event.preventDefault(); if (!self) return;
    try { const target = await findChatUser(phoneLookup); openPrivate(await openPrivateConversation(self, target)); setPhoneLookup(""); setContactsOpen(false); }
    catch (error: any) { toast.error(errorMessage(error, "Mtumiaji hakupatikana.")); }
  };

  const send = async (attachment?: { filePath: string; fileName: string; fileType: string }) => {
    if (!firebaseUser || sending || needsRoom || view === "all" || view === "moderation") return;
    if (!attachment && !draft.trim()) return;
    setSending(true);
    try {
      if (view === "groups") await sendGroupChatMessage(groupId, firebaseUser.uid, draft, reply ?? undefined, attachment, self?.name);
      else await sendChatMessage(view === "public" ? null : roomId, firebaseUser.uid, draft, reply ?? undefined, view === "public", attachment, self?.name);
      setDraft(""); setReply(null); setEmojiOpen(false);
      if (view === "private") void setChatTyping(roomId, firebaseUser.uid, false).catch(() => undefined);
      if (view === "groups") void setChatGroupTyping(groupId, firebaseUser.uid, false).catch(() => undefined);
    } catch (error: any) { toast.error(errorMessage(error, "Ujumbe haukutumwa.")); }
    finally { setSending(false); }
  };

  const onFile = async (file?: File) => {
    if (!file || !firebaseUser || view === "all" || view === "moderation" || needsRoom) return;
    setFileBusy(true);
    try { const attachment = await uploadChatFile(view === "public" ? null : view === "groups" ? groupId : roomId, firebaseUser.uid, file, view === "public", view === "groups"); await send(attachment); }
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
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void onFile(new globalThis.File([blob], `voice-${Date.now()}.webm`, { type: blob.type }));
        stream.getTracks().forEach((t) => t.stop()); streamRef.current = null; setRecording(false);
      };
      recorder.start(); mediaRecorder.current = recorder; setRecording(true);
    } catch { toast.error("Ruhusu matumizi ya microphone ili kurekodi ujumbe wa sauti."); }
  };
  const cancelVoiceNote = () => {
    const recorder = mediaRecorder.current;
    if (recorder) { recorder.onstop = null; try { recorder.stop(); } catch {} }
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setRecording(false);
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!firebaseUser) return;
    if (view === "private" && roomId) void setChatTyping(roomId, firebaseUser.uid, true).catch(() => undefined);
    else if (view === "groups" && groupId) void setChatGroupTyping(groupId, firebaseUser.uid, true).catch(() => undefined);
    else return;
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      if (view === "private") void setChatTyping(roomId, firebaseUser.uid, false).catch(() => undefined);
      else if (view === "groups") void setChatGroupTyping(groupId, firebaseUser.uid, false).catch(() => undefined);
    }, 1500);
  };

  const openGroupSettings = () => {
    if (!currentGroup) return;
    setGroupSettingsName(currentGroup.name); setGroupSettingsDescription(currentGroup.description ?? ""); setGroupSettingsVisibility(currentGroup.visibility);
    setGroupInfoTab("members"); setGroupMemberSearch(""); setGroupSettingsOpen(true);
  };
  const saveGroupSettings = async (event: React.FormEvent) => {
    event.preventDefault(); if (!firebaseUser || !currentGroup) return;
    try { await updateChatGroupSettings(currentGroup.id, firebaseUser.uid, { name: groupSettingsName, description: groupSettingsDescription, visibility: groupSettingsVisibility }); toast.success("Mipangilio ya group imehifadhiwa."); setGroupSettingsOpen(false); }
    catch (error: any) { toast.error(errorMessage(error, "Mipangilio haikuhifadhiwa.")); }
  };
  const onGroupAvatar = async (file?: File) => {
    if (!file || !firebaseUser || !currentGroup) return;
    setGroupAvatarBusy(true);
    try { await uploadChatGroupAvatar(currentGroup.id, firebaseUser.uid, file); toast.success("Picha ya group imebadilishwa."); }
    catch (error: any) { toast.error(errorMessage(error, "Picha ya group haikupakiwa.")); }
    finally { setGroupAvatarBusy(false); if (groupAvatarRef.current) groupAvatarRef.current.value = ""; }
  };
  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault(); if (!self) return;
    const phones = groupPhones.split(/[,\s]+/).map((v) => v.trim()).filter(Boolean);
    if (!groupName.trim() || !phones.length) { toast.error("Weka jina la group na angalau namba moja."); return; }
    try {
      const targets: ChatUser[] = [];
      for (const phone of phones) { const target = await findChatUser(phone); if (target.uid !== self.uid) targets.push(target); }
      const id = await createChatGroup(self, targets, groupName, groupDescription, groupVisibility);
      openGroup(id); setGroupModalOpen(false);
      toast.success(groupVisibility === "public" ? "Public group limeundwa. Sasa inaweza kuonekana na watumiaji wengine." : "Private group limeundwa.");
      setGroupName(""); setGroupPhones(""); setGroupDescription(""); setGroupVisibility("private");
    } catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kuunda group.")); }
  };
  const newGroup = (visibility: "private" | "public") => { setGroupVisibility(visibility); setGroupModalOpen(true); setMenuOpen(false); setContactsOpen(false); };

  const report = async () => {
    if (!firebaseUser || !otherUid || !roomId) return;
    const reason = window.prompt("Eleza kwa kifupi sababu ya kuripoti mtumiaji huyu:"); if (!reason?.trim()) return;
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
    if (!window.confirm(`Futa ujumbe huu ${view === "moderation" ? "kwenye mazungumzo haya" : "kwenye Chat"}? Huwezi kuurudisha.`)) return;
    try { await deleteChatMessage(view === "public" ? null : roomId, message, view === "public"); toast.success("Ujumbe umefutwa."); }
    catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kufuta ujumbe.")); }
  };
  const copyGroupLink = () => {
    if (!currentGroup) return;
    void navigator.clipboard?.writeText(`${window.location.origin}${import.meta.env.BASE_URL}chat?group=${currentGroup.id}`).then(() => toast.success("Link ya group imenakiliwa."));
  };

  /* ── login gate ── */
  if (!isAuthenticated || !firebaseUser) return <main className="portal-main chat-page wa" data-chat-theme={chatTheme}><div className="chat-login-card"><span className="chat-section-mark"><MessageCircle size={22} /></span><h1>Chat ya jumuiya</h1><p>Ingia ili uungane na jumuiya, utume ujumbe na kuzungumza binafsi.</p><Link className="button button--green" href="/">Rudi portal na uingie</Link></div></main>;

  /* ── header text ── */
  const roomTitle = view === "public" ? "SmartServices group" : view === "groups" ? currentGroup?.name ?? "Chagua group" : view === "moderation" ? (currentConversation ? currentConversation.participants.map((id) => currentConversation.names?.[id] ?? id).join(" · ") : "Chagua mazungumzo") : view === "private" ? otherName : "";
  const roomSubtitle = view === "public" ? "Wanachama wote wa SmartServicesTZ wanaweza kushiriki"
    : view === "groups" ? `${currentGroup?.memberIds.length ?? 0} wanachama`
    : view === "moderation" ? "Mwonekano wa msimamizi · mazungumzo binafsi"
    : typing.some((id) => id !== uid) ? "anaandika…"
    : presence?.online ? "Yupo mtandaoni" : showLastSeen && presence?.lastSeen ? `Mara ya mwisho ${timeLabel(presence.lastSeen)}` : "";
  const roomError = view === "public" ? publicError : messageError;
  const loading = view === "public" ? loadingPublic : loadingMessages;
  const typingNames = typing.filter((id) => id !== uid).map((id) => (view === "groups" ? currentGroup?.memberNames?.[id] : currentConversation?.names?.[id]) || "Mwanachama");
  const hasText = draft.trim().length > 0;
  const composerLocked = needsRoom || view === "moderation" || view === "all";
  const memberMatches = (q: string, exclude?: string[]) => members.filter((m) => !exclude?.includes(m.uid) && `${m.name} ${m.phone}`.toLowerCase().includes(q.trim().toLowerCase()));

  const lastTimeOf = (item: unknown) => listTime((item as any)?.updatedAt ?? (item as any)?.lastMessageAt);

  const chips: { id: Category; label: string; show: boolean; count?: number }[] = [
    { id: "all", label: "Yote", show: true },
    { id: "unread", label: "Hayajasomwa", show: true, count: totalUnread },
    { id: "private", label: "Binafsi", show: true },
    { id: "groups", label: "Magroup", show: true },
    { id: "public", label: "Jumuiya", show: true },
    { id: "moderation", label: "Usimamizi", show: canModerate },
  ];

  /* ───────────── render ───────────── */
  return <main className={`portal-main chat-page wa${compactChat ? " chat-compact" : ""}`} data-chat-theme={chatTheme} data-chat-preview={showPreview ? "show" : "hide"} data-chat-view={view} data-chat-selected={chatSelected ? "yes" : "no"}>
    {!mediaReady && <div role="status" className="chat-media-notice"><File size={17} /><span><strong>Ujumbe wa maandishi unapatikana.</strong> Picha, faili na voice message zitasubiri hadi Firebase Storage ianzishwe na rules zake zichapishwe.</span></div>}

    <section className="wa-shell">
      {/* ───── sidebar ───── */}
      <aside className="wa-sidebar">
        <header className="wa-sidebar-head">
          <button type="button" className="wa-self" onClick={() => setSettingsOpen(true)} aria-label="Mipangilio ya chat"><Avatar src={profile?.profileImageUrl} name={self?.name} /></button>
          <h2>Soga</h2>
          <div className="wa-head-actions">
            <button type="button" className="wa-icon-btn" title="Chat mpya" aria-label="Chat mpya" onClick={() => { setMenuOpen(false); setMemberSearch(""); setContactsOpen(true); }}><MessageSquarePlus size={20} /></button>
            <div className="wa-menu-wrap">
              <button type="button" className="wa-icon-btn" title="Menyu" aria-label="Menyu zaidi" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={20} /></button>
              {menuOpen && <div className="wa-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button type="button" role="menuitem" onClick={() => newGroup("private")}>Kikundi kipya</button>
                <button type="button" role="menuitem" onClick={() => newGroup("public")}>Jumuiya mpya</button>
                <button type="button" role="menuitem" onClick={() => { setUnread({}); setCategory("all"); setMenuOpen(false); toast.success("Orodha imewekwa kama imesomwa kwenye kifaa hiki."); }}>Soma zote</button>
                <button type="button" role="menuitem" onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}>Mipangilio</button>
              </div>}
            </div>
          </div>
        </header>

        <label className="wa-search"><Search size={17} /><input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Tafuta au anza chat mpya" />{listSearch && <button type="button" onClick={() => setListSearch("")} aria-label="Futa utafutaji"><X size={15} /></button>}</label>

        <nav className="wa-chips" aria-label="Chuja mazungumzo">
          {chips.filter((c) => c.show).map((c) => <button key={c.id} type="button" className={category === c.id ? "active" : ""} onClick={() => setCategory(c.id)}>{c.label}{c.count ? <b>{c.count}</b> : null}</button>)}
        </nav>

        <div className="wa-list">
          {loadingConversations && <div className="chat-list-hint"><LoaderCircle className="chat-spin" size={17} /> Inapakia mazungumzo…</div>}
          {conversationError && <div className="chat-inline-error">{conversationError}<button type="button" onClick={() => window.location.reload()}>Jaribu tena</button></div>}

          {showPublicRow && <ChatRow active={view === "public"} onClick={openPublic} avatar={<Avatar icon="group" size="lg" />} title="SmartServices group" subtitle="Jumuiya ya wanachama wote" time={lastTimeOf(null)} badge={<i className="wa-live" title="Mazungumzo yanaendelea" />} />}

          {showGroups && !conversationError && allGroups.map((group) => {
            const joined = group.memberIds.includes(uid);
            return <ChatRow key={group.id} active={groupId === group.id && view === "groups"} onClick={() => joined && openGroup(group.id)} avatar={<Avatar src={group.avatarUrl} icon="group" size="lg" />} title={group.name} time={lastTimeOf(group)}
              subtitle={<>{group.visibility === "public" ? "🌐 " : "🔒 "}{group.lastMessage || `${group.memberIds.length} wanachama`}</>}
              badge={group.visibility === "public" && !joined ? <span role="button" tabIndex={0} className="chat-join-pill" onClick={(e) => { e.stopPropagation(); void requestToJoinChatGroup(group.id, self!).then(() => toast.success("Ombi la kujiunga limetumwa.")).catch((error) => toast.error(errorMessage(error, "Ombi halikutumwa."))); }}>OMBA</span> : null} />;
          })}

          {showPrivate && !conversationError && visibleConversations.map((c) => {
            const isMod = category === "moderation";
            const other = c.participants.find((id) => id !== uid) ?? "";
            const name = isMod ? c.participants.map((id) => c.names?.[id] ?? id).join(" · ") : c.names?.[other] ?? "Mwanachama";
            return <ChatRow key={c.id} active={roomId === c.id && (view === "private" || view === "moderation")} onClick={() => (isMod ? openModeration(c.id) : openPrivate(c.id))}
              avatar={<Avatar src={isMod ? undefined : c.profileImages?.[other]} name={name} size="lg" />} title={name} time={lastTimeOf(c)}
              subtitle={c.lastMessage || (isMod ? "Mazungumzo binafsi" : "Mazungumzo yameanza")} unread={isMod ? 0 : unread[c.id]} />;
          })}

          {!loadingConversations && !conversationError && !showPublicRow && allGroups.length === 0 && visibleConversations.length === 0 && <p className="chat-empty">{category === "unread" ? "Hakuna ujumbe ambao haujasomwa." : category === "moderation" ? "Bado hakuna mazungumzo ya kusimamia." : "Hakuna mazungumzo yaliyopatikana. Bonyeza ikoni ya chat mpya kuanza."}</p>}
        </div>
        {category === "moderation" && <div className="chat-moderation-note"><ShieldAlert size={15} /> Ufikiaji wa moderation umewekewa role yenye ruhusa ya kusimamia ujumbe.</div>}
      </aside>

      {/* ───── conversation ───── */}
      <section className="wa-main">
        {view === "all" ? <div className="wa-welcome">
          <span className="wa-welcome-mark"><MessageCircle size={44} /></span>
          <h2>SmartServicesTZ Chat</h2>
          <p>Chagua mazungumzo upande wa kushoto au anza chat mpya na mwanachama yeyote wa jumuiya.</p>
          <button type="button" className="button button--green" onClick={() => { setMemberSearch(""); setContactsOpen(true); }}><MessageSquarePlus size={16} /> Chat mpya</button>
          <small><Lock size={13} /> Ujumbe huhifadhiwa kwa usalama kupitia Firebase.</small>
        </div> : <>
          <header className="wa-room-head">
            <button type="button" className="wa-icon-btn wa-back" aria-label="Rudi kwenye orodha ya mazungumzo" onClick={closeChat}><ArrowLeft size={21} /></button>
            <button type="button" className="wa-room-id" onClick={() => view === "groups" && openGroupSettings()}>
              {view === "groups" ? <Avatar src={currentGroup?.avatarUrl} icon="group" /> : view === "public" ? <Avatar icon="group" /> : <Avatar src={otherImage} name={roomTitle} online={Boolean(presence?.online)} />}
              <span className="wa-room-copy"><strong>{roomTitle}</strong><small className={typing.some((id) => id !== uid) ? "is-typing" : ""}>{roomSubtitle}</small></span>
            </button>
            <div className="wa-head-actions">
              {view === "private" && <>
                <button type="button" className="wa-icon-btn" title="Video call" aria-label="Video call" onClick={() => toast.info("Video call bado haijaunganishwa na huduma ya real-time calling.")}><Video size={19} /></button>
                <button type="button" className="wa-icon-btn" title="Simu ya sauti" aria-label="Simu ya sauti" onClick={() => toast.info("Simu za sauti zitawezeshwa baada ya kuunganishwa na huduma ya real-time calling.")}><Phone size={18} /></button>
              </>}
              <button type="button" className={`wa-icon-btn${messageSearchOpen ? " active" : ""}`} title="Tafuta ujumbe" aria-label="Tafuta ujumbe" onClick={() => { setMessageSearchOpen((v) => !v); if (messageSearchOpen) setMessageSearch(""); }}><Search size={19} /></button>
              {view === "private" && otherUid && <>
                <button type="button" className="wa-icon-btn" title="Ripoti" aria-label="Ripoti mtumiaji" onClick={() => void report()}><ShieldAlert size={19} /></button>
                <button type="button" className="wa-icon-btn" title="Zuia" aria-label="Zuia mtumiaji" onClick={() => void block()}><Ban size={19} /></button>
              </>}
              {view === "groups" && currentGroup && <>
                <button type="button" className="wa-icon-btn" title="Nakili link ya group" aria-label="Nakili link ya group" onClick={copyGroupLink}><Paperclip size={18} style={{ transform: "rotate(-45deg)" }} /></button>
                <button type="button" className="wa-icon-btn" title="Mipangilio ya group" aria-label="Mipangilio ya group" onClick={openGroupSettings}><Settings size={19} /></button>
              </>}
              {view === "moderation" && <span className="chat-admin-badge">MODERATION</span>}
            </div>
            {view === "groups" && currentGroup?.ownerId === uid && joinRequests.length > 0 && <div className="chat-join-requests"><strong>Maombi {joinRequests.length}</strong>{joinRequests.map((r) => <button key={r.id} type="button" onClick={() => void approveChatGroupJoinRequest(currentGroup.id, r).then(() => toast.success(`${r.userName} ameongezwa kwenye group.`)).catch((error) => toast.error(errorMessage(error, "Ombi halikukubaliwa.")))}>{r.userName} · Kubali</button>)}</div>}
          </header>

          {messageSearchOpen && <div className="chat-message-search"><Search size={15} /><input autoFocus value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} placeholder="Tafuta ndani ya ujumbe…" /><button type="button" onClick={() => { setMessageSearch(""); setMessageSearchOpen(false); }} aria-label="Funga utafutaji"><X size={15} /></button></div>}

          <div className="wa-messages" ref={scrollRef} onScroll={onScroll}>
            {needsRoom ? <div className="chat-empty-state"><span className="chat-section-mark"><MessageCircle size={22} /></span><strong>{view === "groups" ? "Chagua group" : "Chagua mazungumzo"}</strong></div>
              : loading ? <div className="chat-empty-state"><LoaderCircle className="chat-spin" size={25} /><span>Inapakia ujumbe…</span></div>
              : roomError ? <div className="chat-empty-state chat-empty-state--error"><ShieldAlert size={28} /><strong>Chat haikupakia</strong><span>{roomError}</span></div>
              : activeMessages.length === 0 ? <div className="chat-empty-state"><span className="chat-section-mark"><MessageCircle size={22} /></span><strong>Hakuna ujumbe bado</strong><span>Anza mazungumzo kwa kutuma ujumbe wa kwanza.</span></div>
              : timeline.map((item) => {
                if (item.kind === "day") return <div className="wa-day" key={item.key}><span>{item.label}</span></div>;
                const { message, first, last } = item;
                const own = message.senderId === uid;
                const isImage = message.fileType?.startsWith("image/");
                const isAudio = message.fileType?.startsWith("audio/");
                const url = attachments[message.id];
                const canEdit = own && Boolean(message.text) && (view === "public" || view === "private");
                const canDelete = view !== "groups" && (own || ((view === "moderation" || view === "public") && canModerate));
                const canReply = view !== "moderation";
                const showName = !own && first && (view === "groups" || view === "public" || view === "moderation");
                return <article key={message.id} className={`wa-msg${own ? " own" : ""}${first ? " first" : ""}${last ? " last" : ""}`}>
                  {!own && (view === "groups" || view === "public") ? (last ? <Avatar src={imageOf(message)} name={nameOf(message)} size="sm" /> : <span className="wa-avatar-spacer" />) : null}
                  <div className={`wa-bubble${last ? " has-tail" : ""}${isImage && !message.text ? " media-only" : ""}`}>
                    {showName && <small className="wa-sender">{nameOf(message)}</small>}
                    {message.replyTo && <div className="wa-quote"><b>{(message.replyTo as any).senderName ?? "Ujumbe"}</b><span>{message.replyTo.text}</span></div>}
                    {message.filePath && url && (isImage ? <a href={url} target="_blank" rel="noreferrer"><img className="chat-image" src={url} alt={message.fileName ?? "Picha iliyotumwa"} /></a> : isAudio ? <audio controls src={url} /> : <a className="chat-file" href={url} download={message.fileName}><File size={18} />{message.fileName ?? "Faili"}</a>)}
                    {message.filePath && !mediaReady && <span className="chat-file-pending"><File size={15} /> Kiambatisho kitasomwa Storage ikianzishwa.</span>}
                    {message.filePath && mediaReady && !url && <span className="chat-file-pending"><LoaderCircle className="chat-spin" size={15} /> Inapakia kiambatisho…</span>}
                    {editingId === message.id
                      ? <div className="chat-edit-box"><textarea autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)} maxLength={5000} /><div><button type="button" onClick={() => { setEditingId(""); setEditDraft(""); }}>Ghairi</button><button type="button" className="primary" onClick={() => void saveEdit(message)}>Hifadhi</button></div></div>
                      : message.text && <p>{message.text}</p>}
                    <span className="wa-meta">{message.editedAt && <em>imehaririwa</em>}<time>{timeLabel(message.createdAt)}</time>{own && view !== "moderation" && <Ticks message={message} uid={uid} />}</span>
                    {editingId !== message.id && (canReply || canEdit || canDelete) && <span className="wa-actions">
                      {canReply && <button type="button" title="Jibu" aria-label="Jibu" onClick={() => setReply(message)}><Reply size={15} /></button>}
                      {canEdit && <button type="button" title="Hariri ujumbe" aria-label="Hariri ujumbe" onClick={() => { setEditingId(message.id); setEditDraft(message.text ?? ""); }}><Pencil size={15} /></button>}
                      {canDelete && <button type="button" className="chat-delete-action" title={canModerate && !own ? "Futa kama moderator" : "Futa ujumbe wangu"} aria-label="Futa ujumbe" onClick={() => void removeMessage(message)}><Trash2 size={15} /></button>}
                    </span>}
                  </div>
                </article>;
              })}
            {typingNames.length > 0 && <div className="wa-typing"><span className="wa-typing-dots"><i /><i /><i /></span><small>{view === "groups" ? `${typingNames.join(", ")} anaandika…` : ""}</small></div>}
          </div>

          {showJump && <button type="button" className="wa-jump" onClick={jumpToEnd} aria-label="Nenda mwisho wa mazungumzo"><ChevronDown size={20} />{totalUnread > 0 && view !== "private" ? <b>{totalUnread}</b> : null}</button>}

          {reply && <div className="wa-reply-bar"><div><b>{nameOf(reply)}</b><span>{reply.text ?? reply.fileName ?? "Kiambatisho"}</span></div><button type="button" onClick={() => setReply(null)} aria-label="Ghairi jibu"><X size={17} /></button></div>}
          {emojiOpen && !composerLocked && <div className="chat-emoji-row" role="group" aria-label="Chagua emoji">{EMOJIS.map((emoji) => <button type="button" key={emoji} aria-label={`Weka ${emoji}`} onClick={() => setDraft((v) => v + emoji)}>{emoji}</button>)}</div>}

          <form className="wa-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input ref={fileRef} type="file" hidden accept="image/*,application/pdf,text/plain,audio/*" disabled={!mediaReady} onChange={(e) => void onFile(e.target.files?.[0])} />
            {recording ? <div className="wa-recording">
              <button type="button" className="wa-icon-btn danger" onClick={cancelVoiceNote} aria-label="Futa rekodi"><Trash2 size={20} /></button>
              <span className="wa-rec-dot" /><strong>{clock(recordSeconds)}</strong><small>Inarekodi…</small>
              <button type="button" className="wa-round wa-send" onClick={() => mediaRecorder.current?.stop()} aria-label="Tuma voice message"><Send size={20} /></button>
            </div> : <>
              <div className="wa-input-pill">
                <button type="button" className="wa-icon-btn" title="Emoji" aria-label="Fungua emoji" aria-expanded={emojiOpen} disabled={composerLocked} onClick={() => setEmojiOpen((v) => !v)}><Smile size={21} /></button>
                <input value={draft} onChange={(e) => onDraftChange(e.target.value)} disabled={composerLocked} maxLength={5000}
                  placeholder={view === "moderation" ? "Moderation ni ya kusoma na kusimamia tu" : composerLocked ? "Chagua mazungumzo kwanza" : view === "public" ? "Andika ujumbe wa jumuiya" : view === "groups" ? "Andika ujumbe wa group" : "Andika ujumbe"} />
                <button type="button" className="wa-icon-btn" title={mediaReady ? "Ambatisha picha/faili" : "Firebase Storage haijawezeshwa"} aria-label="Ambatisha faili" disabled={!mediaReady || fileBusy || composerLocked} onClick={() => fileRef.current?.click()}>{fileBusy ? <LoaderCircle className="chat-spin" size={20} /> : <Paperclip size={20} />}</button>
              </div>
              {hasText
                ? <button className="wa-round wa-send" type="submit" title="Tuma ujumbe" aria-label="Tuma ujumbe" disabled={sending || composerLocked}>{sending ? <LoaderCircle className="chat-spin" size={20} /> : <Send size={20} />}</button>
                : <button className="wa-round wa-mic" type="button" title={mediaReady ? "Rekodi voice message" : "Firebase Storage haijawezeshwa"} aria-label="Rekodi voice message" disabled={!mediaReady || composerLocked || view === "moderation"} onClick={() => void startVoiceNote()}><Mic size={20} /></button>}
            </>}
          </form>
        </>}
      </section>
    </section>

    {/* ───── new chat ───── */}
    {contactsOpen && <div className="portal-modal-backdrop chat-contacts-backdrop" onClick={() => setContactsOpen(false)}><section className="portal-modal chat-members-modal" role="dialog" aria-modal="true" aria-labelledby="chat-members-title" onClick={(e) => e.stopPropagation()}>
      <header><div><span className="overline">SMARTSERVICESTZ</span><h3 id="chat-members-title">Chat mpya</h3><p>Chagua mwanachama au tafuta kwa namba ya simu.</p></div><button type="button" className="modal-close" onClick={() => setContactsOpen(false)} aria-label="Funga"><X size={19} /></button></header>
      <label className="wa-search"><Search size={17} /><input autoFocus value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Tafuta jina au namba ya simu" /></label>
      <div className="wa-new-actions"><button type="button" onClick={() => newGroup("private")}><span className="wa-avatar wa-avatar--md wa-avatar--group"><Users size={18} /></span>Kikundi kipya</button><button type="button" onClick={() => newGroup("public")}><span className="wa-avatar wa-avatar--md wa-avatar--group"><Users size={18} /></span>Jumuiya mpya</button></div>
      <div className="chat-member-directory">
        {memberMatches(memberSearch).map((m) => <button type="button" className="wa-row" key={m.uid} onClick={async () => { if (!self) return; try { openPrivate(await openPrivateConversation(self, m)); setContactsOpen(false); } catch (error: any) { toast.error(errorMessage(error, "Imeshindikana kufungua chat.")); } }}><Avatar src={m.profileImageUrl} name={m.name} size="lg" /><span className="wa-row-body"><span className="wa-row-top"><strong>{m.name}</strong></span><span className="wa-row-bottom"><small>{m.phone || "Mwanachama wa SmartServicesTZ"}</small></span></span></button>)}
        {members.length === 0 && <p className="chat-empty">Orodha ya wanachama haijapatikana. Huenda Firestore Rules haziruhusu kusoma orodha ya watumiaji.</p>}
        {members.length > 0 && memberMatches(memberSearch).length === 0 && /\d{6,}/.test(memberSearch) && <form className="chat-start-form" onSubmit={(e) => { setPhoneLookup(memberSearch); void startPrivateChat(e); }}><button className="button button--green button--wide" type="submit" onClick={() => setPhoneLookup(memberSearch)}><Send size={15} /> Tafuta {memberSearch} kwa namba</button></form>}
      </div>
    </section></div>}

    {settingsOpen && <ChatSettings onClose={() => setSettingsOpen(false)} profileName={self?.name || "$teward Tz"} username={profile?.username ? "@" + profile.username : "@Steward.tz"} />}

    {/* ───── group info ───── */}
    {groupSettingsOpen && currentGroup && <div className="portal-modal-backdrop chat-group-settings-backdrop" onClick={() => setGroupSettingsOpen(false)}><section className="portal-modal chat-group-settings-modal chat-group-info-dashboard" role="dialog" aria-modal="true" aria-labelledby="chat-group-settings-title" onClick={(e) => e.stopPropagation()}>
      <header className="chat-group-settings-head"><div className="chat-group-avatar-large">{currentGroup.avatarUrl ? <img src={currentGroup.avatarUrl} alt="Picha ya group" /> : <Users size={28} />}</div><div><span className="overline">GROUP INFO</span><h3 id="chat-group-settings-title">{currentGroup.name}</h3><p>{currentGroup.memberIds.length} washiriki · {currentGroup.visibility === "public" ? "Jumuiya ya wazi" : "Group la faragha"}</p></div><button type="button" className="modal-close" onClick={() => setGroupSettingsOpen(false)} aria-label="Funga"><X size={19} /></button></header>
      <div className="chat-group-info-quick"><button type="button" onClick={copyGroupLink}><Paperclip size={17} /> Nakili link</button><button type="button" onClick={() => { setGroupSettingsOpen(false); setMessageSearchOpen(true); setMessageSearch(""); }}><Search size={17} /> Tafuta</button></div>
      <div className="chat-group-description-panel"><strong>Maelezo na sheria za group</strong><p>{currentGroup.description || "Hakuna sheria au maelezo yaliyowekwa na msimamizi."}</p><small>Group limeundwa: {toDate(currentGroup.createdAt)?.toLocaleDateString("sw-TZ", { day: "numeric", month: "long", year: "numeric" }) ?? "Tarehe haipatikani"}</small></div>
      <nav className="chat-group-info-tabs" aria-label="Taarifa za group">
        <button type="button" className={groupInfoTab === "members" ? "active" : ""} onClick={() => setGroupInfoTab("members")}><Users size={15} /> Wanakikundi <span>{currentGroup.memberIds.length}</span></button>
        <button type="button" className={groupInfoTab === "media" ? "active" : ""} onClick={() => setGroupInfoTab("media")}><File size={15} /> Maudhui</button>
        <button type="button" className={groupInfoTab === "settings" ? "active" : ""} onClick={() => setGroupInfoTab("settings")}><Settings size={15} /> Mipangilio</button>
      </nav>
      <div className="chat-group-settings-body chat-group-info-content">
        {groupInfoTab === "members" && <>
          <div className="chat-group-info-section-title"><strong>Washiriki ({currentGroup.memberIds.length})</strong>{currentGroup.ownerId === uid && <button type="button" className="chat-add-member-btn" onClick={() => { setAddMemberSearch(""); setAddMemberOpen(true); }}><Users size={15} /> Ongeza washiriki</button>}</div>
          <input className="chat-group-member-search" value={groupMemberSearch} onChange={(e) => setGroupMemberSearch(e.target.value)} placeholder="Tafuta mwanachama kwa jina au simu…" />
          <div className="chat-group-member-list">{currentGroup.memberIds.filter((id) => `${currentGroup.memberNames?.[id] ?? ""} ${currentGroup.memberPhones?.[id] ?? ""}`.toLowerCase().includes(groupMemberSearch.trim().toLowerCase())).map((id) => {
            const isOwner = id === currentGroup.ownerId; const name = currentGroup.memberNames?.[id] || "Mwanachama";
            return <div className="chat-group-member-row" key={id}><Avatar src={currentGroup.memberImages?.[id]} name={name} /><span className="chat-group-member-copy"><strong>{name}{id === uid ? " (Wewe)" : ""}</strong><small>{currentGroup.memberPhones?.[id] || "Namba haijawekwa"}</small></span><span className={isOwner ? "chat-group-role admin" : "chat-group-role"}>{isOwner ? "Msimamizi" : "Mwanachama"}</span></div>;
          })}</div>
          {currentGroup.ownerId === uid && <>
            <input ref={groupAvatarRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => void onGroupAvatar(e.target.files?.[0])} />
            <button type="button" className="chat-group-avatar-action" onClick={() => groupAvatarRef.current?.click()} disabled={groupAvatarBusy}><Camera size={16} />{groupAvatarBusy ? "Inapakia picha…" : "Badilisha picha ya group"}</button>
            <form className="chat-group-settings-form" onSubmit={(e) => void saveGroupSettings(e)}>
              <label className="control-field"><span>Jina la group</span><input value={groupSettingsName} onChange={(e) => setGroupSettingsName(e.target.value)} maxLength={80} required /></label>
              <label className="control-field"><span>Maelezo / sheria za group</span><textarea value={groupSettingsDescription} onChange={(e) => setGroupSettingsDescription(e.target.value)} maxLength={240} rows={2} /></label>
              <label className="control-field"><span>Faragha ya group</span><select value={groupSettingsVisibility} onChange={(e) => setGroupSettingsVisibility(e.target.value as "private" | "public")}><option value="private">Private — walioalikwa pekee</option><option value="public">Public — watu wanaweza kuomba kujiunga</option></select></label>
              <button type="submit" className="button button--green button--wide">Hifadhi maelezo ya group</button>
            </form>
          </>}
        </>}
        {groupInfoTab === "media" && (() => {
          const media = groupMessages.filter((m) => m.filePath);
          return <><div className="chat-group-info-section-title"><strong>Media, viungo na nyaraka</strong><span>{media.length} faili</span></div>
            {media.length ? <div className="chat-group-media-grid">{media.map((m) => <a key={m.id} className="chat-group-media-item" href={attachments[m.id]} download={m.fileName || "kiambatisho"} target="_blank" rel="noreferrer">{m.fileType?.startsWith("image/") && attachments[m.id] ? <img src={attachments[m.id]} alt={m.fileName || "Picha ya group"} /> : <span className="chat-group-media-file"><File size={24} /><small>{m.fileName || "Nyaraka"}</small></span>}<small>{m.senderName || currentGroup.memberNames?.[m.senderId] || "Mwanachama"}</small></a>)}</div>
              : <div className="chat-group-info-empty"><File size={25} /><strong>Hakuna maudhui yaliyotumwa bado</strong><span>Picha na nyaraka zitaonekana hapa baada ya kutumwa kwenye group.</span></div>}</>;
        })()}
        {groupInfoTab === "settings" && <div className="chat-group-preferences">
          <label className="chat-group-pref-row"><span><strong>Arifa za group</strong><small>Ruhusu arifa za ujumbe mpya kwenye kifaa hiki.</small></span><input type="checkbox" checked={groupNotifications} onChange={(e) => setGroupNotifications(e.target.checked)} /></label>
          <label className="chat-group-pref-row"><span><strong>Upakuaji wa maudhui</strong><small>Ruhusu picha/nyaraka kupakuliwa moja kwa moja pale unapozifungua.</small></span><input type="checkbox" checked={groupAutoDownload} onChange={(e) => setGroupAutoDownload(e.target.checked)} /></label>
          <div className="chat-group-encryption-note"><ShieldAlert size={18} /><span><strong>Usalama wa ujumbe</strong><small>Ujumbe huhifadhiwa kupitia Firebase. Usimbaji fiche wa mwisho-hadi-mwisho (E2E) haujawashwa kwenye mfumo huu kwa sasa.</small></span></div>
          <label className="chat-group-pref-row"><span><strong>Ujumbe unaotoweka</strong><small>Mpangilio wa kifaa hiki pekee; kufuta kiotomatiki kwenye seva hakujawashwa.</small></span><input type="checkbox" checked={groupDisappearing} onChange={(e) => setGroupDisappearing(e.target.checked)} /></label>
          <label className="chat-group-pref-row"><span><strong>Kufunga soga kwa PIN</strong><small>Ulinzi wa PIN haujaunganishwa na uthibitishaji salama bado.</small></span><input type="checkbox" checked={groupLockEnabled} onChange={(e) => setGroupLockEnabled(e.target.checked)} /></label>
          <div className="chat-group-danger-actions">
            <button type="button" onClick={() => { const reason = window.prompt("Eleza sababu ya kuripoti group:"); if (!reason?.trim()) return; void reportChatGroup(uid, currentGroup.id, currentGroup.name, reason).then(() => toast.success("Ripoti ya group imetumwa.")).catch((error) => toast.error(errorMessage(error, "Imeshindikana kuripoti group."))); }}><ShieldAlert size={16} /> Ripoti kikundi</button>
            {currentGroup.ownerId !== uid && <button type="button" onClick={() => { if (!window.confirm("Una uhakika unataka kutoka kwenye group hili?")) return; void leaveChatGroup(currentGroup.id, uid).then(() => { setGroupSettingsOpen(false); closeChat(); toast.success("Umetoka kwenye group."); }).catch((error) => toast.error(errorMessage(error, "Imeshindikana kutoka kwenye group."))); }}><X size={16} /> Toka kwenye kikundi</button>}
          </div>
        </div>}
      </div>
    </section></div>}

    {/* ───── add members ───── */}
    {addMemberOpen && currentGroup && <div className="portal-modal-backdrop chat-group-settings-backdrop" onClick={() => setAddMemberOpen(false)}><section className="portal-modal chat-add-member-modal" role="dialog" aria-modal="true" aria-labelledby="chat-add-member-title" onClick={(e) => e.stopPropagation()}>
      <header className="chat-group-settings-head"><div><span className="overline">GROUP MEMBERS</span><h3 id="chat-add-member-title">Ongeza washiriki</h3><p>Tafuta akaunti ya SmartServicesTZ kisha bonyeza Ongeza.</p></div><button type="button" className="modal-close" onClick={() => setAddMemberOpen(false)} aria-label="Funga"><X size={19} /></button></header>
      <div className="chat-add-member-body">
        <input className="chat-group-member-search" autoFocus value={addMemberSearch} onChange={(e) => setAddMemberSearch(e.target.value)} placeholder="Tafuta jina au namba ya simu…" />
        {(() => { const list = memberMatches(addMemberSearch, currentGroup.memberIds); return list.length === 0
          ? <div className="chat-group-info-empty"><Users size={24} /><span>Hakuna mtumiaji mpya anayelingana na utafutaji.</span></div>
          : list.map((m) => <div className="chat-add-member-row" key={m.uid}><Avatar src={m.profileImageUrl} name={m.name} /><span><strong>{m.name}</strong><small>{m.phone || "Namba haijawekwa"}</small></span><button type="button" disabled={Boolean(addingMemberUid)} onClick={() => { setAddingMemberUid(m.uid); void addChatGroupMember(currentGroup.id, uid, m).then(() => toast.success(`${m.name} ameongezwa kwenye group.`)).catch((error) => toast.error(errorMessage(error, "Imeshindikana kuongeza mwanachama."))).finally(() => setAddingMemberUid("")); }}>{addingMemberUid === m.uid ? "Inaongeza…" : "Ongeza"}</button></div>); })()}
      </div>
    </section></div>}

    {/* ───── create group ───── */}
    {groupModalOpen && <div className="portal-modal-backdrop" onClick={() => setGroupModalOpen(false)}><form className="portal-modal chat-group-modal" onSubmit={createGroup} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="modal-close" onClick={() => setGroupModalOpen(false)} aria-label="Funga"><X size={19} /></button>
      <span className="overline">NEW GROUP</span><h3>{groupVisibility === "public" ? "Jumuiya mpya" : "Kikundi kipya"}</h3><p>Weka jina la group na namba za simu za watu unaotaka kuwaongeza.</p>
      <label className="control-field"><span>Jina la group</span><input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Mfano: Wafanyabiashara Kiteto" /></label>
      <label className="control-field"><span>Namba za simu</span><textarea value={groupPhones} onChange={(e) => setGroupPhones(e.target.value)} placeholder="0698..., 0754... au kila namba mstari mpya" rows={4} /></label>
      <label className="control-field"><span>Maelezo (hiari)</span><textarea value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="Group hili linahusu nini?" rows={3} /></label>
      <label className="control-field"><span>Aina ya group</span><select value={groupVisibility} onChange={(e) => setGroupVisibility(e.target.value as "private" | "public")}><option value="private">Private — walioalikwa pekee</option><option value="public">Public — ombi la kujiunga</option></select></label>
      <button type="submit" className="button button--green button--wide"><Users size={16} /> Unda group</button>
    </form></div>}
  </main>;
}
