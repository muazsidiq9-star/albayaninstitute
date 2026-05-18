// ===========================
// LOGIN PAGE JS
// ===========================

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const userType = document.getElementById("userType");
  const rememberMe = document.getElementById("rememberMe");
  const submitBtn = document.querySelector(".submit-btn");

  const supabase = window.supabase;
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const role = userType.value;

    if (!email || !password || !role) {
      alert(t("Please fill all fields"));
      return;
    }

    try {
      let username = "";

      // Disable button and show processing
      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = t("Processing... ⏳");

      // ================= ADMIN LOGIN =================
      if (role === "admin") {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    alert(t("Invalid admin login"));
    return;
  }

  const user = data.user;

  // 🔥 Get role from profiles table
  const { data: profile, error: roleError } = await supabase
  .from("profiles")
  .select("role, full_name")
  .eq("id", user.id)
  .single();

  if (roleError || !profile) {
    alert("No role assigned. Contact developer.");
    return;
  }

  const actualRole = profile.role;

// Save session
sessionStorage.setItem("role", actualRole);
sessionStorage.setItem("user_id", user.id);
sessionStorage.setItem("full_name", profile.full_name || ""); // ✅ ADD THIS LINE

let username = formatRole(profile.role);

  const template = t("Welcome back, Admin {username}!");
  sessionStorage.setItem("welcomeMessage", template.replace("{username}", username));

  showWelcomeBanner("admin", username);

  setTimeout(() => {
    window.location.href = "admin-dashboard.html";
  }, 2000);
}

      // ================= STUDENT LOGIN =================
      if (role === "student") {
        const { data: student, error } = await supabase
          .from("students")
          .select("matric_number, fullname, email, level_arabic, country, plan_type, password, password_changed")
          .eq("email", email)
          .single();

        if (error || !student) {
          alert(t("Invalid student login"));
          return;
        }

        // Check password
        let passwordValid = false;
        if (student.password_changed) {
          if (student.password === password) passwordValid = true;
        } else {
          if (student.matric_number === password) passwordValid = true;
        }

        if (!passwordValid) {
          const defaultMsg = student.password_changed
            ? t("Incorrect password.")
            : t("Invalid student password.\n\nYour default password is your Matric Number.");
          alert(defaultMsg);
          return;
        }

        const currentStudent = {
  matric_number: student.matric_number,
  fullname: student.fullname,
  email: student.email,
  level: student.level_arabic,
  country: student.country,
  plan_type: student.plan_type
};

        sessionStorage.setItem("role", "student");
        sessionStorage.setItem("matric", student.matric_number);
        sessionStorage.setItem("currentStudent", JSON.stringify(currentStudent));

        username = student.fullname;

        if (rememberMe && rememberMe.checked) {
          localStorage.setItem("rememberedEmail", email);
        } else {
          localStorage.removeItem("rememberedEmail");
        }

        // ================= Welcome Message =================
        const template = t("Welcome back, {username}!");
        sessionStorage.setItem("welcomeMessage", template.replace("{username}", username));

        showWelcomeBanner("student", username);

        setTimeout(() => {
          window.location.href = "students-dashboard.html";
        }, 2000);
      }
    } catch (err) {
      console.error("LOGIN ERROR:", err);
      alert(t("Login failed. Check console for details."));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = t("Login");
    }
  });

  function formatRole(role) {
  if (!role) return "User";

  return role
    .replace("_", " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}
  // ================= REMEMBER EMAIL =================
  const savedEmail = localStorage.getItem("rememberedEmail");
  if (savedEmail) {
    emailInput.value = savedEmail;
    if (rememberMe) rememberMe.checked = true;
  }

  // ================= WELCOME BANNER =================
  function showWelcomeBanner(role, name) {
    const banner = document.createElement("div");
    banner.id = "welcome-banner";

    // Use translated template
    const template = t("Welcome back, {username}!");
    banner.innerHTML = `<strong>${template.replace("{username}", name)}</strong>`;

    // Style
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.backgroundColor = "#4CAF50"; // Green
    banner.style.color = "#fff";
    banner.style.fontSize = "1.2rem";
    banner.style.fontWeight = "bold";
    banner.style.textAlign = "center";
    banner.style.padding = "1rem 0";
    banner.style.zIndex = "9999";
    banner.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
    banner.style.opacity = "1";
    banner.style.transition = "opacity 0.5s ease";

    document.body.appendChild(banner);

    // Fade out after 2 seconds
    setTimeout(() => {
      banner.style.opacity = "0";
      setTimeout(() => banner.remove(), 500);
    }, 2000);
  }
});
