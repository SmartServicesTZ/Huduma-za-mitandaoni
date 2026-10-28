import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

/** Read only the newest security audit entries when the admin opens Security. */
export async function getRecentSecurityLogs(name: "adminActions" | "auditLogs") {
  const snapshot = await getDocs(query(collection(firestore, name), orderBy("createdAt", "desc"), limit(100)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
