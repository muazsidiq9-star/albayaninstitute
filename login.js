// ===========================
// MODERN LOGIN SYSTEM (PRODUCTION CLEAN)
// ===========================

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const userType = document.getElementById("userType");
  const rememberMe = document.getElementById("rememberMe");
  const submitBtn = document.querySelector(".submit-btn");
  const forgotLink = document.getElementById("forgotPasswordLink");

  const supabase = window.supabase;
  if (!form) return;

  // ===========================
  // ROLE GROUPS
  // ===========================
  const adminRoles = [
    "mudeer",
    "assistant_mudeer",
    "bursar",
    "registrar"
  ];

  const staffRoles = ["teacher"];

  // ===========================
  // FORGOT PASSWORD ROUTING
  // ===========================
  function updateForgotPasswordLink() {
    const role = userType.value;

    forgotLink.href =
      role === "student"
        ? "forgot-password.html?type=student"
        : "forgot-password.html?type=auth";
  }

  userType?.addEventListener("change", updateForgotPasswordLink);
  updateForgotPasswordLink();

  // ===========================
  // LOGIN SUBMIT
  // ===========================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const selectedRole = userType.value;

    if (!email || !password || !selectedRole) {
      alert(t("Please fill all fields"));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = t("Processing... ⏳");

    try {
      let username = "";
      let redirectPage = "";

      // ===========================
      // STUDENT LOGIN (CUSTOM SYSTEM)
      // ===========================
      if (selectedRole === "student") {
        const { data: student, error } = await supabase
          .from("students")
          .select("matric_number, fullname, email, level_arabic, country, plan_type, password, password_changed")
          .eq("email", email)
          .single();

        if (error || !student) {
          alert(t("Invalid login credentials"));
          return;
        }

        let passwordValid =
          student.password_changed
            ? student.password === password
            : student.matric_number === password;

        if (!passwordValid) {
          alert(t("Invalid login credentials"));
          return;
        }

        sessionStorage.setItem("role", "student");
        sessionStorage.setItem("matric", student.matric_number);

        sessionStorage.setItem(
          "currentStudent",
          JSON.stringify({
            matric_number: student.matric_number,
            fullname: student.fullname,
            email: student.email,
            level: student.level_arabic,
            country: student.country,
            plan_type: student.plan_type
          })
        );

        username = student.fullname;
        redirectPage = "students-dashboard.html";

        if (rememberMe?.checked) {
          localStorage.setItem("rememberedEmail", email);
        } else {
          localStorage.removeItem("rememberedEmail");
        }
      }

      // ===========================
      // AUTH USERS (ADMIN + STAFF)
      // ===========================
      else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error || !data.user) {
          alert(t("Invalid login credentials"));
          return;
        }

        const user = data.user;

        const { data: profile, error: roleError } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("id", user.id)
          .single();

        if (roleError || !profile) {
          await supabase.auth.signOut();
          alert(t("Invalid login credentials"));
          return;
        }

        const userRole = profile.role;

        // ===========================
        // ROLE VALIDATION (SECURE)
        // ===========================
        const roleMap = {
          admin: adminRoles,
          staff: staffRoles
        };

        const allowedRoles = roleMap[selectedRole];

        if (!allowedRoles || !allowedRoles.includes(userRole)) {
          await supabase.auth.signOut();
          alert(t("Invalid login credentials"));
          return;
        }

        // ===========================
        // SESSION STORAGE
        // ===========================
        sessionStorage.setItem("role", userRole);
        sessionStorage.setItem("user_id", user.id);
        sessionStorage.setItem("full_name", profile.full_name || "");

        username = profile.full_name || "User";

        // ===========================
        // ROUTING
        // ===========================
        if (adminRoles.includes(userRole)) {
          redirectPage = "admin-dashboard.html";
        } else {
          redirectPage = "staff-dashboard.html";
        }
      }

      // ===========================
      // SUCCESS UI
      // ===========================
      const template = t("Welcome back, {username}!");
      sessionStorage.setItem(
        "welcomeMessage",
        template.replace("{username}", username)
      );

      showWelcomeBanner(selectedRole, username);

      setTimeout(() => {
        window.location.href = redirectPage;
      }, 2000);

    } catch (err) {
      console.error("LOGIN ERROR:", err);
      alert(t("Invalid login credentials"));
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = t("Login");
    }
  });

  // ===========================
  // REMEMBER EMAIL
  // ===========================
  const savedEmail = localStorage.getItem("rememberedEmail");
  if (savedEmail) {
    emailInput.value = savedEmail;
    if (rememberMe) rememberMe.checked = true;
  }

  // ===========================
  // WELCOME BANNER
  // ===========================
  function showWelcomeBanner(role, name) {
    const banner = document.createElement("div");
    banner.id = "welcome-banner";

    const template = t("Welcome back, {username}!");
    banner.innerHTML = `<strong>${template.replace("{username}", name)}</strong>`;

    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
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

    setTimeout(() => {
      banner.style.opacity = "0";
      setTimeout(() => banner.remove(), 500);
    }, 2000);
  }
});