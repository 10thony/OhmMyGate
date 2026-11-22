window.ohmClerk = (function () {
  let clerk = null;
  let ready = null;
  let bound = false;

  function appUrl(path) {
    const base = document.querySelector("base")?.href || `${location.origin}/`;
    return new URL(String(path).replace(/^\//, ""), base).toString();
  }

  function stayHere() {
    return window.location.href;
  }

  function preferRedirect() {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (_) {}
    return window.innerWidth < 800;
  }

  function clerkReturnPending() {
    try {
      if (sessionStorage.getItem("ohm-clerk-pending") === "1") return true;
    } catch (_) {}
    const u = new URL(window.location.href);
    return [...u.searchParams.keys()].some((k) => k.startsWith("__clerk"));
  }

  async function loadClerkScript(src, publishableKey) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-ohm-clerk="1"]`);
      if (existing) {
        if (window.Clerk) {
          resolve(window.Clerk);
          return;
        }
        existing.addEventListener("load", () => resolve(window.Clerk));
        existing.addEventListener("error", reject);
        return;
      }

      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.dataset.ohmClerk = "1";
      s.setAttribute("data-clerk-publishable-key", publishableKey);
      s.onload = () => resolve(window.Clerk);
      s.onerror = () => reject(new Error("Failed to load Clerk script"));
      document.head.appendChild(s);
    });
  }

  async function ensure() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = await fetch(appUrl("/api/auth/config")).then((r) => r.json());
      if (!cfg.configured || !cfg.publishableKey) {
        throw new Error("Clerk is not configured on the server");
      }

      const authority = (cfg.authority || "").replace(/\/$/, "");
      const src = authority
        ? `${authority}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
        : "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

      clerk = await loadClerkScript(src, cfg.publishableKey);
      if (!clerk) throw new Error("Clerk global was not created");
      if (typeof clerk.load === "function") {
        const back = loginHome();
        await clerk.load({
          signInForceRedirectUrl: back,
          signUpForceRedirectUrl: back,
          afterSignOutUrl: back,
        });
      }
      return clerk;
    })();
    return ready;
  }

  function waitForSession(c, timeoutMs) {
    if (c.session) return Promise.resolve(c.session);
    return new Promise((resolve) => {
      let done = false;
      const finish = (session) => {
        if (done) return;
        done = true;
        try {
          if (typeof unsub === "function") unsub();
        } catch (_) {}
        clearInterval(poll);
        clearTimeout(timer);
        resolve(session || null);
      };

      const unsub =
        typeof c.addListener === "function"
          ? c.addListener((res) => {
              if (res?.session) finish(res.session);
            })
          : null;

      const poll = setInterval(() => {
        if (c.session) finish(c.session);
      }, 300);

      const timer = setTimeout(() => finish(c.session || null), timeoutMs || 120000);
    });
  }

  async function syncSession() {
    const c = await ensure();
    const session = c.session;
    if (!session) return { signedIn: false };

    let token = null;
    try {
      token = await session.getToken();
    } catch (_) {}

    const payload = {
      token: token || null,
      sessionId: session.id || null,
      firstName: c.user?.firstName || null,
    };

    const res = await fetch(appUrl("/api/auth/clerk"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to establish app session (${res.status}): ${text}`);
    }

    return { signedIn: true, ...(await res.json()) };
  }

  function hardReload() {
    const url = new URL(window.location.href);
    url.searchParams.delete("_auth");
    [...url.searchParams.keys()]
      .filter((k) => k.startsWith("__clerk"))
      .forEach((k) => url.searchParams.delete(k));
    const returnUrl = url.searchParams.get("returnUrl");
    if (returnUrl && returnUrl.startsWith("/")) {
      window.location.replace(returnUrl);
      return;
    }
    window.location.replace(url.toString());
  }

  function loginHome() {
    try {
      const base = document.querySelector("base")?.href;
      if (base) return new URL("login" + window.location.search, base).toString();
    } catch (_) {}
    return stayHere();
  }

  async function signIn() {
    const c = await ensure();
    const back = loginHome();
    if (!c.session) {
      if (preferRedirect() && typeof c.redirectToSignIn === "function") {
        try {
          sessionStorage.setItem("ohm-clerk-pending", "1");
        } catch (_) {}
        await c.redirectToSignIn({
          redirectUrl: back,
          signInForceRedirectUrl: back,
        });
        return { signedIn: false };
      }
      await c.openSignIn({
        forceRedirectUrl: back,
        signInForceRedirectUrl: back,
      });
      const session = await waitForSession(c, 120000);
      if (!session) return { signedIn: false };
    }
    const result = await syncSession();
    if (result.signedIn) hardReload();
    return result;
  }

  async function signUp() {
    const c = await ensure();
    const back = loginHome();
    if (!c.session) {
      if (preferRedirect() && typeof c.redirectToSignUp === "function") {
        try {
          sessionStorage.setItem("ohm-clerk-pending", "1");
        } catch (_) {}
        await c.redirectToSignUp({
          redirectUrl: back,
          signUpForceRedirectUrl: back,
        });
        return { signedIn: false };
      }
      if (typeof c.openSignUp === "function") {
        await c.openSignUp({
          forceRedirectUrl: back,
          signUpForceRedirectUrl: back,
        });
      } else {
        await c.openSignIn({
          forceRedirectUrl: back,
          signInForceRedirectUrl: back,
        });
      }
      const session = await waitForSession(c, 120000);
      if (!session) return { signedIn: false };
    }
    const result = await syncSession();
    if (result.signedIn) hardReload();
    return result;
  }

  async function signOut() {
    try {
      const c = await ensure();
      await c.signOut();
    } catch (_) {}
    await fetch(appUrl("/api/auth/logout"), { method: "POST", credentials: "same-origin" });
    hardReload();
  }

  async function consumeReturn() {
    if (!clerkReturnPending()) return;
    try {
      sessionStorage.removeItem("ohm-clerk-pending");
    } catch (_) {}
    try {
      const me = await fetch(appUrl("/api/auth/me"), { credentials: "same-origin" }).then((r) =>
        r.json()
      );
      if (me?.signedIn) {
        hardReload();
        return;
      }
      const c = await ensure();
      if (!c.session) return;
      const result = await syncSession();
      if (result.signedIn) hardReload();
    } catch (err) {
      console.warn("ohmClerk.consumeReturn failed", err);
    }
  }

  function onClick(e) {
    const signInBtn = e.target.closest("[data-ohm-clerk-signin]");
    if (signInBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (signInBtn.dataset.ohmBusy === "1") return;
      signInBtn.dataset.ohmBusy = "1";
      signInBtn.disabled = true;
      signIn()
        .catch((err) => console.warn("ohmClerk.signIn failed", err))
        .finally(() => {
          delete signInBtn.dataset.ohmBusy;
          signInBtn.disabled = false;
        });
      return;
    }

    const signUpBtn = e.target.closest("[data-ohm-clerk-signup]");
    if (signUpBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (signUpBtn.dataset.ohmBusy === "1") return;
      signUpBtn.dataset.ohmBusy = "1";
      signUpBtn.disabled = true;
      signUp()
        .catch((err) => console.warn("ohmClerk.signUp failed", err))
        .finally(() => {
          delete signUpBtn.dataset.ohmBusy;
          signUpBtn.disabled = false;
        });
      return;
    }

    const signOutBtn = e.target.closest("[data-ohm-clerk-signout]");
    if (signOutBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (signOutBtn.disabled) return;
      signOutBtn.disabled = true;
      signOut().catch((err) => {
        console.warn("ohmClerk.signOut failed", err);
        signOutBtn.disabled = false;
      });
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", onClick, true);
    consumeReturn();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  return { signIn, signUp, signOut, hardReload };
})();
