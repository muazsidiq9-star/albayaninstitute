// ============================================
// STUDENT GUARD
// Logs a student out if their account has been soft-deleted since they
// logged in. Include on every student page, AFTER the supabase-js script:
//   <script src="student-guard.js"></script>
// Self-contained: it creates its own client, so it works regardless of what
// each page calls its own (db / sb / supabaseClient).
// ============================================

(function () {
  const SUPABASE_URL = "https://cjrpjekmqrckozrbtwps.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nR5kvC32lYVX0OflJM8sUA_tBaqRy1b";

  function clearStudentSession() {
    sessionStorage.clear();
    localStorage.removeItem("studentSession");
    localStorage.removeItem("currentAssessmentId");
  }

  async function checkStudentStillActive() {
    const role   = sessionStorage.getItem("role");
    const matric = sessionStorage.getItem("matric");

    // Not a student session (or the page's own guard will handle it)
    if (role !== "student" || !matric) return;
    if (!window.supabase || !window.supabase.createClient) return;

    try {
      // persistSession/autoRefreshToken: false -- this client only ever does
      // one read-only lookup, so it has no business managing an auth session.
      // Without this, it fights the page's own Supabase client over the same
      // storage key ("Multiple GoTrueClient instances..." warning).
      const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const { data, error } = await client
        .from("students")
        .select("deleted")
        .eq("matric_number", matric)
        .maybeSingle();

      // Fail open on lookup problems so a network blip never logs anyone out
      if (error) return;

      // Row gone entirely (permanently deleted) or soft-deleted
      if (!data || data.deleted === true) {
        clearStudentSession();
        const msg = (typeof t === "function")
          ? t("Your account is no longer active. Please contact the institute.")
          : "Your account is no longer active. Please contact the institute.";
        alert(msg);
        window.location.href = "login.html";
      }
    } catch (e) {
      console.error("Student guard check failed:", e);
    }
  }

  // Direct-link support. Runs immediately (before DOMContentLoaded), so the
  // deleted-account check below also covers students arriving with only the
  // 14-day saved session:
  //   - sessionStorage already has a student session -> nothing to do
  //   - else a still-valid localStorage "studentSession" -> restore it
  //   - else remember this page in "postLoginRedirect" so login.js sends the
  //     student back here after login (the page's own guard does the redirect)
  // Relative target only (file name + query), never a full URL.
  function restoreSavedSession() {
    try {
      if (sessionStorage.getItem("role") === "student" && sessionStorage.getItem("matric")) return;

      const raw   = localStorage.getItem("studentSession");
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && saved.role === "student" && saved.matric &&
          saved.expiresAt && Date.now() < saved.expiresAt) {
        sessionStorage.setItem("role", "student");
        sessionStorage.setItem("matric", saved.matric);
        if (saved.currentStudent) sessionStorage.setItem("currentStudent", saved.currentStudent);
        return;
      }

      sessionStorage.setItem("postLoginRedirect", location.pathname.split("/").pop() + location.search);
    } catch (e) { /* storage blocked: normal login flow */ }
  }

  restoreSavedSession();

  document.addEventListener("DOMContentLoaded", checkStudentStillActive);
})();