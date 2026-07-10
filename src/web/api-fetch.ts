// Session-expiry handling for every API call. A 401 mid-session previously
// surfaced as opaque "Request failed (401)" toasts with the user stranded in
// the shell; now it redirects to sign-in. The cached DEK is deliberately NOT
// cleared: re-authenticating as the same user restores the unlocked vault,
// the same policy as a page reload (auth and unlock are separate gates).

/** Injectable for tests; the app default is a hard redirect to sign-in. */
export const sessionExpiry = {
  redirect: (): void => window.location.assign("/auth"),
};

/** fetch that treats 401 as an expired session instead of a generic error. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    sessionExpiry.redirect();
    throw new Error("Your session expired. Sign in again to continue.");
  }
  return res;
}
