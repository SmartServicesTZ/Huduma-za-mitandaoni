import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { ApiError } from "./api-adapter.js";

const firebaseJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

/**
 * Verify a Firebase ID token against the configured project.
 * `getKey` is injectable so unit tests can use a local synthetic JWKS without network access.
 */
export async function verifyFirebaseIdToken(
  request: Request,
  projectId: string | undefined,
  getKey: JWTVerifyGetKey = firebaseJwks,
) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) throw new ApiError("unauthenticated", "Ingia kwanza.");
  if (!projectId) throw new Error("Firebase project is not configured.");

  try {
    const verified = await jwtVerify(match[1], getKey, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    const uid = verified.payload.sub;
    if (typeof uid !== "string" || uid.length < 1 || uid.length > 128) throw new Error("invalid sub");
    const email = typeof verified.payload.email === "string" ? verified.payload.email : undefined;
    return { uid, email };
  } catch {
    throw new ApiError("unauthenticated", "Kikao cha kuingia kimeisha au si sahihi. Ingia tena.");
  }
}
